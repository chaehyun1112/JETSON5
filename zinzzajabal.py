#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
라즈베리파이 스마트 약통 최종 실전 코드

DB 구조 기준:
- TB_SENIOR.PILLBOX_NUM으로 이 라즈베리파이가 담당할 시니어를 찾는다.
- TB_MEDICINE_SCHEDULE에서 오늘 현재 시간에 해당하는 기본 복약 스케줄을 조회한다.
- TB_SCHEDULE에 오늘 날짜별 복약 기록을 생성/수정한다.
- TB_PILLBOX_LOG에 하드웨어 이벤트 로그를 저장한다.
- TB_PILLBOX_STATUS에 전원 ON/OFF 및 heartbeat를 저장한다.
- TB_ALERT에 미복약 알림을 저장한다.

하드웨어 요구사항:
- 지정된 복약 시간에 LED + 부저 + LCD 알림
- 리드스위치 + 마이크로스위치로 문 개폐 판단
- 문이 열린 뒤 30분 동안 로드셀 무게 변화 감지
- 전원 상태 ON/OFF 판단
- I2C HX711 로드셀 4개:
  slot 1 = 0x64
  slot 2 = 0x65
  slot 3 = 0x66
  slot 4 = 0x67

중요:
- DFRobot I2C HX711은 begin() 반환값을 검사하지 않는다.
- 네가 성공했던 방식 그대로:
  sensor = hx.DFRobot_HX711_I2C(1, address)
  sensor.begin()
  sensor.read_weight(3)
- setup 단계에서 read_weight 실패로 센서를 제거하지 않는다.
- 실제 복약 판단은 read_stable_weight()로 여러 번 읽은 중앙값을 사용한다.
"""

import io
import os
import signal
import socket
import statistics
import sys
import threading
import time
from contextlib import contextmanager, redirect_stdout
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

import mysql.connector

try:
    from solapi import SolapiMessageService
    from solapi.model import RequestMessage
except Exception as exc:
    SolapiMessageService = None
    RequestMessage = None
    SOLAPI_IMPORT_ERROR = exc
else:
    SOLAPI_IMPORT_ERROR = None


# =========================================================
# GPIO, LCD 라이브러리 불러오기
# =========================================================

try:
    import RPi.GPIO as GPIO
except (ImportError, RuntimeError) as exc:
    GPIO = None
    GPIO_IMPORT_ERROR = exc
else:
    GPIO_IMPORT_ERROR = None

try:
    from RPLCD.i2c import CharLCD
except ImportError as exc:
    CharLCD = None
    LCD_IMPORT_ERROR = exc
else:
    LCD_IMPORT_ERROR = None

try:
    from rpi_ws281x import Color, PixelStrip
except Exception as exc:
    Color = None
    PixelStrip = None
    WS2812_IMPORT_ERROR = exc
else:
    WS2812_IMPORT_ERROR = None


# =========================================================
# DFRobot I2C HX711 라이브러리 불러오기
# =========================================================

DFROBOT_HX711_LIB_PATH = os.getenv(
    "DFROBOT_HX711_LIB_PATH",
    "/home/pi/DFRobot_HX711_I2C/python/raspberrypi",
)

if DFROBOT_HX711_LIB_PATH not in sys.path:
    sys.path.append(DFROBOT_HX711_LIB_PATH)

try:
    import DFRobot_HX711_I2C as hx
except Exception as exc:
    hx = None
    HX711_IMPORT_ERROR = exc
else:
    HX711_IMPORT_ERROR = None


# =========================================================
# 로컬 환경변수 파일
# =========================================================

def load_env_file(path: str) -> bool:
    """
    로컬 환경변수 파일에서 KEY=VALUE 형태의 설정을 읽어 온다.

    사용 이유:
    - SOLAPI 키, 발신번호, DB 비밀번호처럼 민감한 값은 코드에 직접 쓰지 않는다.
    - 시연 때는 /home/pi/.pillbox_env 파일에 값을 넣어 두고 프로그램이 시작될 때 읽는다.
    - 이미 운영체제 환경변수로 들어온 값이 있으면 그 값을 우선한다.

    처리 방식:
    - 빈 줄과 #으로 시작하는 줄은 무시한다.
    - export KEY=VALUE 형태도 허용한다.
    - 값 양쪽의 작은따옴표/큰따옴표는 제거한다.
    """
    if not path or not os.path.exists(path):
        return False

    loaded = False

    try:
        with open(path, "r", encoding="utf-8") as env_file:
            for raw_line in env_file:
                line = raw_line.strip()

                if not line or line.startswith("#") or "=" not in line:
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                if key.startswith("export "):
                    key = key[len("export "):].strip()
                value = value.strip().strip('"').strip("'")

                if key and key not in os.environ:
                    os.environ[key] = value
                    loaded = True
    except Exception as exc:
        print(f"[WARN] env file load failed path={path}: {exc}")
        return False

    if loaded:
        print(f"[INFO] env file loaded path={path}")

    return loaded


for _env_path in (
    os.getenv("PILLBOX_ENV_FILE", ""),
    "/home/pi/.pillbox_env",
    os.path.join(os.getcwd(), ".env"),
):
    load_env_file(_env_path)


# =========================================================
# DB 설정
# =========================================================

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "project-db-campus.smhrd.com"),
    "port": int(os.getenv("DB_PORT", "3307")),
    "user": os.getenv("DB_USER", "JETSON5"),
    "password": os.getenv("DB_PASSWORD", "5555"),
    "database": os.getenv("DB_NAME", "JETSON5"),
    "charset": "utf8mb4",
}

# 이 라즈베리파이의 약통 번호.
# 반드시 TB_SENIOR.PILLBOX_NUM과 같아야 한다.
PILLBOX_NUM = os.getenv("PILLBOX_NUM", "PILL01")

CODE_VERSION = "2026-07-07 OPEN-WEIGHT-TAKEN v15"

# 기본 실행은 핵심 이벤트만 출력한다.
# 상세 스케줄 후보/문 상태/무게 샘플 로그가 필요할 때만 VERBOSE_DEBUG=1로 켠다.
VERBOSE_DEBUG = os.getenv("VERBOSE_DEBUG", "0") == "1"


# =========================================================
# GPIO 핀 설정
# =========================================================
# 전부 BCM 번호 기준이다.

BUZZER_PIN = int(os.getenv("BUZZER_PIN", "24"))

# 슬롯별 LED
# 실제 연결 핀과 다르면 환경변수 파일 또는 실행 명령에서 바꿀 수 있다.
LED_PIN = int(os.getenv("LED_PIN", "25"))
LED_TYPE = os.getenv("LED_TYPE", "gpio").strip().lower()
USE_WS2812 = os.getenv("WS2812_ENABLE", "0") == "1" or LED_TYPE in ("ws2812", "neopixel")

# WS2812B 8구 주소지정 RGB LED 바 설정.
# 이 LED는 일반 LED처럼 GPIO 값을 단순히 켜고 끄는 방식으로 제어되지 않는다.
# rpi_ws281x 라이브러리가 매우 정확한 타이밍 신호를 만들어야 하므로,
# 지원되는 GPIO 핀과 sudo 실행이 필요하다.
#
# 배선 기준:
# - LED DIN은 기본값 BCM GPIO12, 물리핀 32번에 연결한다.
# - GPIO18은 리드스위치와 충돌할 수 있으므로 이 프로젝트에서는 쓰지 않는다.
# - LED 전원은 GPIO가 아니라 5V/GND에서 공급한다.
# - LED GND와 라즈베리파이 GND는 반드시 공통 접지로 묶는다.
# - 8개를 흰색 최대 밝기로 켜면 전류가 커질 수 있으므로 기본 밝기는 낮게 둔다.
WS2812_LED_COUNT = int(os.getenv("WS2812_LED_COUNT", "8"))
WS2812_PIN = int(os.getenv("WS2812_PIN", "12"))
WS2812_FREQ_HZ = int(os.getenv("WS2812_FREQ_HZ", "800000"))
WS2812_DMA = int(os.getenv("WS2812_DMA", "10"))
WS2812_BRIGHTNESS = int(os.getenv("WS2812_BRIGHTNESS", "32"))
WS2812_INVERT = os.getenv("WS2812_INVERT", "0") == "1"
WS2812_CHANNEL = int(os.getenv("WS2812_CHANNEL", "0"))
WS2812_CLEAR_ON_EXIT = os.getenv("WS2812_CLEAR_ON_EXIT", "1") == "1"

# rpi_ws281x는 아무 GPIO에서나 동작하지 않는다.
# GPIO25는 일반 LED에는 사용할 수 있지만 WS2812 타이밍 신호용 핀은 아니다.
# 잘못된 핀을 넣으면 라이브러리 내부에서 오류가 크게 날 수 있어, 사용 가능한 핀만 허용한다.
# 이 프로젝트의 기본 권장 핀은 GPIO12다.
WS2812_SUPPORTED_PINS = {10, 12, 13, 18, 21}

WS2812_SLOT_COLORS = {
    1: (255, 0, 0),      # 빨강
    2: (0, 255, 0),      # 초록
    3: (0, 80, 255),     # 파랑
    4: (255, 180, 0),    # 주황
}

LED_PINS = {
    1: LED_PIN,
    2: LED_PIN,
    3: LED_PIN,
    4: LED_PIN,
}

# 슬롯별 리드스위치
# 기본값은 최초 배선 기준이다.
# 실제 약통에서 슬롯 순서가 바뀌면 코드를 고치지 말고 /home/pi/.pillbox_env에
# REED_PIN_2=27 같은 식으로 덮어쓴다.
REED_PINS = {
    1: int(os.getenv("REED_PIN_1", "17")),
    2: int(os.getenv("REED_PIN_2", "18")),
    3: int(os.getenv("REED_PIN_3", "27")),
    4: int(os.getenv("REED_PIN_4", "22")),
}

# 공통 마이크로스위치 1개
MICRO_SWITCH_PIN = int(os.getenv("MICRO_SWITCH_PIN", "23"))

# 문 센서 기준:
# 내부 PUD_UP + 스위치/센서 감지 시 GND로 떨어지는 액티브 로우 배선이다.
# 원시값 의미:
# - 0 = 감지됨 / 눌림
# - 1 = 감지 안 됨 / 안 눌림
# 문 상태 의미:
# - 닫힘 = 리드스위치가 자석을 감지하고, 마이크로스위치가 눌린 상태
# - 열림 = 리드스위치가 자석을 감지하지 않고, 마이크로스위치도 안 눌린 상태
# GPIO 값으로 쓰면:
# - 닫힘 = reed=0, micro=0
# - 열림 = reed=1, micro=1
#
# 문 열림은 reed와 micro가 둘 다 열림일 때만 인정한다.
# 둘 중 하나만 흔들리는 상황에서 OPEN 로그가 잘못 남는 것을 줄이기 위한 조건이다.
#
# 매우 중요:
# - 문 닫힘은 복약 완료 조건이 아니다.
# - 문이 열린 뒤 바로 로드셀 무게 감지를 시작한다.
# - 기준 무게보다 무게가 줄어들면 문이 열린 상태든 닫힌 상태든 복약 완료로 본다.
# - 문 닫힘은 감지되면 CLOSE 로그를 남기는 보조 이벤트일 뿐이다.
DOOR_OPEN_VALUE_RAW = int(os.getenv("DOOR_OPEN_VALUE", "1"))

# 문 열림 판단 방식
# reed_only: 슬롯별 리드스위치만 열림이면 문 열림
# reed_or_micro: 리드 또는 마이크로 둘 중 하나라도 열림이면 문 열림
# reed_and_micro: 리드와 마이크로가 둘 다 열림이면 문 열림
DOOR_OPEN_MODE = os.getenv("DOOR_OPEN_MODE", "reed_and_micro").strip().lower()

# 문 상태 상세 로그 출력 간격.
# 실제 감지는 0.2초마다 하되, 로그는 상태가 바뀌거나 이 시간마다만 출력한다.
DOOR_DEBUG_PRINT_INTERVAL_SEC = float(os.getenv("DOOR_DEBUG_PRINT_INTERVAL_SEC", "2.0"))

# 문 센서 입력 기준
# 액티브 로우 기준:
# - 감지/눌림 = 0
# - 감지 없음/안 눌림 = 1
# 이 배선에서는 PUD_UP을 기본으로 사용한다.
# 마이크로스위치도 COM-GPIO23, NO-GND 방식으로 연결하면 안 눌림 1, 눌림 0이 된다.
DOOR_PULL_MODE = os.getenv("DOOR_PULL_MODE", "up").strip().lower()

# 노이즈/순간 튐 방지: 연속 N번 문 열림이어야 진짜 열림으로 판단
DOOR_OPEN_STABLE_COUNT = int(os.getenv("DOOR_OPEN_STABLE_COUNT", "3"))
DOOR_OPEN_STABLE_DELAY_SEC = float(os.getenv("DOOR_OPEN_STABLE_DELAY_SEC", "0.05"))


# =========================================================
# 부저 설정
# =========================================================

BUZZER_PWM_FREQ = int(os.getenv("BUZZER_PWM_FREQ", "1000"))
BUZZER_DUTY_CYCLE = int(os.getenv("BUZZER_DUTY_CYCLE", "20"))


# =========================================================
# LCD 설정
# =========================================================

LCD_I2C_ADDRESS = int(os.getenv("LCD_I2C_ADDRESS", "0x27"), 16)
LCD_COLS = int(os.getenv("LCD_COLS", "16"))
LCD_ROWS = int(os.getenv("LCD_ROWS", "2"))


# =========================================================
# I2C HX711 로드셀 설정
# =========================================================

IIC_MODE = int(os.getenv("IIC_MODE", "1"))

LOADCELL_I2C_ADDRESSES = {
    1: int(os.getenv("LOADCELL_ADDR_1", "0x64"), 16),
    2: int(os.getenv("LOADCELL_ADDR_2", "0x65"), 16),
    3: int(os.getenv("LOADCELL_ADDR_3", "0x66"), 16),
    4: int(os.getenv("LOADCELL_ADDR_4", "0x67"), 16),
}

LOADCELL_READ_TIMES = int(os.getenv("LOADCELL_READ_TIMES", "3"))

# HX711 begin()은 전원이 들어와 있어도 I2C 버스 상태에 따라 가끔 Errno 5/121로 실패한다.
# 한 번 실패했다고 고장으로 보지 않고 여러 번 재시도한다.
LOADCELL_SETUP_RETRY_COUNT = int(os.getenv("LOADCELL_SETUP_RETRY_COUNT", "12"))
LOADCELL_SETUP_RETRY_DELAY_SEC = float(os.getenv("LOADCELL_SETUP_RETRY_DELAY_SEC", "0.50"))
LOADCELL_SETUP_BETWEEN_DELAY_SEC = float(os.getenv("LOADCELL_SETUP_BETWEEN_DELAY_SEC", "0.20"))

# 무게를 읽는 중에도 순간적인 I2C 오류가 날 수 있다.
# 따라서 read_weight()도 바로 실패 처리하지 않고 짧게 재시도한다.
LOADCELL_READ_RETRY_COUNT = int(os.getenv("LOADCELL_READ_RETRY_COUNT", "3"))
LOADCELL_READ_RETRY_DELAY_SEC = float(os.getenv("LOADCELL_READ_RETRY_DELAY_SEC", "0.08"))

# DFRobot 라이브러리가 내부 보정 전 값을 콘솔에 직접 출력하는 경우가 있다.
# 기본 실행 로그가 너무 길어지지 않게 그 출력을 숨긴다.
SUPPRESS_HX711_LIBRARY_PRINTS = os.getenv("SUPPRESS_HX711_LIBRARY_PRINTS", "1") == "1"

# 무게가 이 값 이상 감소하면 약이 빠진 것으로 판단.
# 약이 매우 가벼울 수 있으므로 슬롯별 임계값을 지원한다.
# 오늘 측정한 노이즈 기준 기본값:
# - 슬롯 1/3/4: 약 0.10g
# - 슬롯 2: 약 0.15g
# TAKEN_WEIGHT_DROP_GRAM을 주면 모든 슬롯 기본값을 한 번에 바꿀 수 있다.
# TAKEN_WEIGHT_DROP_GRAM_SLOT_2처럼 슬롯별 값을 주면 해당 슬롯 값이 최우선이다.
#
# 복약 판단 방식:
# - 현재 무게가 몇 g인지 하나만 보고 판단하지 않는다.
# - 알림 직전에 기준 무게를 잡고, 이후 현재 무게와 비교한다.
# - 기준 무게 - 현재 무게가 슬롯별 임계값 이상이면 "약이 빠졌다"는 후보로 본다.
# - 이 후보가 TAKEN_CONFIRM_COUNT번 연속으로 확인되어야 복약 완료로 확정한다.
# - 슬롯마다 로드셀 흔들림이 달라서 슬롯별 임계값을 따로 둘 수 있게 했다.
#
# HX711 특성:
# - DFRobot HX711 begin()은 시작 시점의 하중을 영점으로 잡을 수 있다.
# - 프로그램 시작 전에 이미 약이 올라가 있으면 기준 무게가 0g 근처로 보일 수 있다.
# - 이 경우 약을 빼면 현재 무게가 음수처럼 보일 수 있으므로 별도 보호 로직으로 처리한다.
TAKEN_WEIGHT_DROP_GRAM_RAW = os.getenv("TAKEN_WEIGHT_DROP_GRAM")
TAKEN_WEIGHT_DROP_GRAM = float(TAKEN_WEIGHT_DROP_GRAM_RAW or "0.15")
TAKEN_WEIGHT_DROP_GRAM_SLOT_DEFAULTS = {
    1: "0.10",
    2: "0.15",
    3: "0.10",
    4: "0.10",
}
TAKEN_WEIGHT_DROP_GRAM_BY_SLOT = {
    slot: float(
        os.getenv(
            f"TAKEN_WEIGHT_DROP_GRAM_SLOT_{slot}",
            TAKEN_WEIGHT_DROP_GRAM_RAW or default_value,
        )
    )
    for slot, default_value in TAKEN_WEIGHT_DROP_GRAM_SLOT_DEFAULTS.items()
}

# 한 번 튄 값으로 복약 완료 처리하지 않기 위한 안전장치.
# 알약/소량 약 기준으로 15g 이상 갑자기 빠지는 값은 튐값으로 본다.
# 실제 약 봉투가 더 무거우면 환경변수로 올리면 된다.
MAX_TAKEN_WEIGHT_DROP_GRAM = float(os.getenv("MAX_TAKEN_WEIGHT_DROP_GRAM", "30.0"))

# 복약 완료 판단은 1번이 아니라 연속 N번 만족해야 확정한다.
# 임계값을 낮춘 만큼 기본 확인 횟수는 3회로 둔다.
TAKEN_CONFIRM_COUNT = int(os.getenv("TAKEN_CONFIRM_COUNT", "3"))

# 안정 무게 측정 설정
STABLE_WEIGHT_SAMPLES = int(os.getenv("STABLE_WEIGHT_SAMPLES", "30"))
STABLE_WEIGHT_DELAY_SEC = float(os.getenv("STABLE_WEIGHT_DELAY_SEC", "0.05"))
STABLE_WEIGHT_TRIM_RATIO = float(os.getenv("STABLE_WEIGHT_TRIM_RATIO", "0.2"))
WEIGHT_ZERO_DEADBAND_GRAM = float(os.getenv("WEIGHT_ZERO_DEADBAND_GRAM", "0.2"))
# 기준 무게가 0g 근처일 때의 보호 모드.
# 일반 상황:
# - 기준 무게가 0.30g 이상이면 보통 방식으로 무게 감소를 본다.
# - 너무 큰 감소값은 센서 튐값으로 보고 버린다.
#
# 보호 모드 상황:
# - 기준 무게가 0.30g 미만이면 HX711이 현재 하중을 영점으로 잡았을 가능성이 있다.
# - 그래도 약이 매우 가벼운 경우가 있으므로 작은 무게 감소는 복약 후보로 인정한다.
# - 대신 갑자기 -10g처럼 크게 튀는 값은 실제 복약이 아니라 센서 드리프트로 보고 WEIGHTERR 로그만 남긴다.
NEAR_ZERO_BASELINE_GRAM = float(os.getenv("NEAR_ZERO_BASELINE_GRAM", "0.30"))
NEAR_ZERO_MAX_TAKEN_WEIGHT_DROP_GRAM = float(
    os.getenv("NEAR_ZERO_MAX_TAKEN_WEIGHT_DROP_GRAM", "2.0")
)
NEAR_ZERO_TAKEN_CONFIRM_COUNT = int(os.getenv("NEAR_ZERO_TAKEN_CONFIRM_COUNT", "5"))
LOADCELL_ABSOLUTE_OUTLIER_LIMIT_GRAM = float(
    os.getenv("LOADCELL_ABSOLUTE_OUTLIER_LIMIT_GRAM", "1000.0")
)

# 최종 코드 시작 직후 로드셀 실제 읽기 확인
LOADCELL_STARTUP_SELF_CHECK = os.getenv("LOADCELL_STARTUP_SELF_CHECK", "1") == "1"
LOADCELL_STARTUP_SELF_CHECK_ROUNDS = int(os.getenv("LOADCELL_STARTUP_SELF_CHECK_ROUNDS", "5"))
LOADCELL_STARTUP_SELF_CHECK_DELAY_SEC = float(os.getenv("LOADCELL_STARTUP_SELF_CHECK_DELAY_SEC", "0.2"))


# =========================================================
# 실행 주기 설정
# =========================================================

HEARTBEAT_INTERVAL_SEC = int(os.getenv("HEARTBEAT_INTERVAL_SEC", "20"))
SCHEDULE_POLL_INTERVAL_SEC = int(os.getenv("SCHEDULE_POLL_INTERVAL_SEC", "10"))

# 조회된 스케줄이 0개일 때 디버그 로그를 얼마나 자주 출력할지 정한다.
# 기본 실행에서는 반복 로그를 꺼서 콘솔이 지저분해지지 않게 한다.
# 상세 분석이 필요하면 VERBOSE_DEBUG=1로 실행하고, 이 값으로 출력 빈도를 조절한다.
SCHEDULE_DEBUG_EVERY_N_EMPTY = int(
    os.getenv("SCHEDULE_DEBUG_EVERY_N_EMPTY", "6" if VERBOSE_DEBUG else "0")
)

# 복약 예정 시간 기준 몇 초 전부터 잡을지.
# 예: 30초 전부터 알림 시작 가능.
SCHEDULE_EARLY_SEC = int(os.getenv("SCHEDULE_EARLY_SEC", "30"))

# 복약 예정 시간 기준 몇 초 후까지 이미 지난 스케줄을 잡을지.
SCHEDULE_LOOKBACK_SEC = int(os.getenv("SCHEDULE_LOOKBACK_SEC", "120"))

# 문 열림 대기 시간이다. 단위는 "분"이다.
# 지정 시간에 알림이 시작된 뒤 이 시간 안에 문이 열리지 않으면 미복약으로 처리한다.
# 시연 시간을 줄이고 싶으면 실행할 때 DOOR_OPEN_WAIT_MIN 값을 작게 준다.
DOOR_OPEN_WAIT_MIN = int(os.getenv("DOOR_OPEN_WAIT_MIN", "30"))

# 문이 열린 뒤 로드셀로 약 유무를 감지할 시간이다. 단위는 "분"이다.
# 이 시간 안에 기준 무게보다 충분한 감소가 확인되면 복약 완료가 된다.
# 이 시간이 끝날 때까지 무게 감소가 없으면 미복약으로 처리한다.
WEIGHT_MONITOR_AFTER_OPEN_MIN = int(os.getenv("WEIGHT_MONITOR_AFTER_OPEN_MIN", "30"))

# 문이 열린 후 사용자가 약을 꺼내고 손을 뗄 시간을 잠시 준다.
AFTER_DOOR_OPEN_SETTLE_SEC = float(os.getenv("AFTER_DOOR_OPEN_SETTLE_SEC", "3"))


# =========================================================
# SOLAPI SMS 설정
# =========================================================
# SOLAPI 콘솔에서 API 키와 API 시크릿을 발급받아 환경변수로 넣는 것을 권장한다.
# 발신번호는 SOLAPI에 등록된 발신번호여야 한다.
# 보안상 API 키, API 시크릿, 발신번호는 코드에 직접 넣지 않고 환경변수로 주입한다.
SOLAPI_API_KEY = os.getenv("SOLAPI_API_KEY", "")
SOLAPI_API_SECRET = os.getenv("SOLAPI_API_SECRET", "")
SMS_SENDER_PHONE = os.getenv("SMS_SENDER_PHONE", "")

# 1이면 실제 문자 발송 안 하고 콘솔에만 출력한다.
# 실제 발송할 때만 SMS_DRY_RUN=0으로 실행한다.
SMS_DRY_RUN = os.getenv("SMS_DRY_RUN", "1") == "1"


def mask_secret(value: str, keep: int = 4) -> str:
    if not value:
        return "missing"
    if len(value) <= keep:
        return "*" * len(value)
    return f"{value[:2]}***{value[-keep:]}"


def validate_sms_config(log: bool = True) -> bool:
    """
    SOLAPI 실제 발송에 필요한 설정이 들어왔는지 확인한다.

    보안상 API 키와 시크릿 원문은 출력하지 않는다.
    이 함수가 True를 반환하면 실제 문자 발송에 필요한 최소 설정이 갖춰진 상태다.
    단, SMS_DRY_RUN=1이면 실제 통신을 하지 않으므로 설정이 부족해도 dry-run 로그만으로 테스트가 진행될 수 있다.
    """
    from_phone = normalize_phone(SMS_SENDER_PHONE)
    ok = True

    if SolapiMessageService is None or RequestMessage is None:
        ok = False
        if log:
            print(f"[WARN] SOLAPI import failed: {SOLAPI_IMPORT_ERROR}")
            print("[WARN] install command: pip3 install solapi --break-system-packages")

    if not SOLAPI_API_KEY:
        ok = False
        if log:
            print("[WARN] SOLAPI_API_KEY is empty.")

    if not SOLAPI_API_SECRET:
        ok = False
        if log:
            print("[WARN] SOLAPI_API_SECRET is empty.")

    if not from_phone:
        ok = False
        if log:
            print("[WARN] SMS_SENDER_PHONE is empty.")
    elif len(from_phone) < 9 or len(from_phone) > 11:
        ok = False
        if log:
            print(f"[WARN] SMS_SENDER_PHONE format looks invalid digits_len={len(from_phone)}.")

    if log:
        mode = "DRY_RUN" if SMS_DRY_RUN else "REAL_SEND"
        print(
            f"[INFO] SMS config mode={mode}, "
            f"api_key={mask_secret(SOLAPI_API_KEY)}, "
            f"api_secret={'set' if SOLAPI_API_SECRET else 'missing'}, "
            f"sender={'***' + from_phone[-4:] if from_phone else 'missing'}"
        )

    return ok


# =========================================================
# 데이터 구조
# =========================================================

@dataclass
class SeniorInfo:
    senior_id: str
    senior_name: str
    senior_phone: Optional[str]
    guardian_id: Optional[str]
    guardian_name: Optional[str]
    guardian_phone: Optional[str]


@dataclass
class MedicineSchedule:
    medi_sche_cd: int
    senior_id: str
    pillbox_order: int
    taking_type: str
    taking_time: str
    sche_cd: Optional[int] = None


stop_event = threading.Event()


def debug_log(message: str):
    if VERBOSE_DEBUG:
        print(message)


def get_taken_weight_drop_gram(slot_num: int) -> float:
    return TAKEN_WEIGHT_DROP_GRAM_BY_SLOT.get(slot_num, TAKEN_WEIGHT_DROP_GRAM)


# =========================================================
# DB 공통 함수
# =========================================================

@contextmanager
def db_conn():
    conn = mysql.connector.connect(**DB_CONFIG)

    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch_one_dict(cursor) -> Optional[Dict]:
    row = cursor.fetchone()
    if row is None:
        return None
    return dict(zip(cursor.column_names, row))


def fetch_all_dict(cursor) -> List[Dict]:
    return [dict(zip(cursor.column_names, row)) for row in cursor.fetchall()]


def get_local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return "127.0.0.1"


# =========================================================
# DB 조회/저장 함수
# =========================================================

def get_pillbox_senior() -> SeniorInfo:
    """
    TB_SENIOR.PILLBOX_NUM으로 현재 약통에 연결된 시니어와 보호자 정보를 조회한다.
    """
    sql = """
        SELECT
          S.SENIOR_ID,
          S.SENIOR_NAME,
          S.SENIOR_CONTACT,
          S.MEM_ID,
          M.MEM_NAME,
          M.MEM_CONTACT
        FROM TB_SENIOR S
        LEFT JOIN TB_MEMBER M
          ON M.MEM_ID = S.MEM_ID
        WHERE S.PILLBOX_NUM = %s
        LIMIT 1
    """

    with db_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (PILLBOX_NUM,))
        row = fetch_one_dict(cur)

    if not row:
        raise RuntimeError(f"TB_SENIOR에 등록된 약통 번호가 없습니다: {PILLBOX_NUM}")

    return SeniorInfo(
        senior_id=row["SENIOR_ID"],
        senior_name=row["SENIOR_NAME"],
        senior_phone=row.get("SENIOR_CONTACT"),
        guardian_id=row.get("MEM_ID"),
        guardian_name=row.get("MEM_NAME"),
        guardian_phone=row.get("MEM_CONTACT"),
    )


def upsert_power_status(power_status: str = "Y"):
    """
    전원 상태를 TB_PILLBOX_STATUS에 저장한다.

    ON 판단:
    - 프로그램 실행 중 HEARTBEAT_INTERVAL_SEC마다 POWER_STATUS='Y'와 LAST_HEARTBEAT_AT 갱신

    OFF 판단:
    - Ctrl+C/정상 종료 시 POWER_STATUS='N'
    - 갑자기 전원이 빠지면 이 함수가 실행되지 않으므로,
      웹 화면에서는 LAST_HEARTBEAT_AT이 오래된 경우 OFF로 간주하는 보조 로직이 필요하다.
    """
    senior = get_pillbox_senior()

    sql = """
        INSERT INTO TB_PILLBOX_STATUS
          (PILLBOX_NUM, SENIOR_ID, POWER_STATUS, LAST_HEARTBEAT_AT, IP_ADDR)
        VALUES
          (%s, %s, %s, NOW(), %s)
        ON DUPLICATE KEY UPDATE
          SENIOR_ID = VALUES(SENIOR_ID),
          POWER_STATUS = VALUES(POWER_STATUS),
          LAST_HEARTBEAT_AT = NOW(),
          IP_ADDR = VALUES(IP_ADDR),
          UPDATED_AT = CURRENT_TIMESTAMP
    """

    with db_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (PILLBOX_NUM, senior.senior_id, power_status, get_local_ip()))


def set_power_off():
    sql = """
        UPDATE TB_PILLBOX_STATUS
        SET POWER_STATUS = 'N',
            UPDATED_AT = CURRENT_TIMESTAMP
        WHERE PILLBOX_NUM = %s
    """

    try:
        with db_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql, (PILLBOX_NUM,))
    except Exception as exc:
        print(f"[WARN] power off update failed: {exc}")


def fetch_due_schedules(senior_id: str) -> List[MedicineSchedule]:
    """
    현재 울려야 하는 복약 스케줄 조회.

    조건:
    - 현재 시니어
    - 사용 중인 기본 스케줄
    - 시작일/종료일 조건 만족
    - 현재 시간 기준 SCHEDULE_EARLY_SEC 전부터 SCHEDULE_LOOKBACK_SEC 후까지
    - 오늘 이미 TAKING_YN='Y'인 스케줄 제외
    """
    # DB 관계:
    # - TB_MEDICINE_SCHEDULE: 반복/기본 복약 계획이다.
    #   예: "chae02 시니어가 4번 슬롯 약을 취침 전 22:30에 복용한다".
    # - TB_SCHEDULE: 특정 날짜의 실제 복약 기록이다.
    #   예: "2026-07-07에 해당 약을 먹었는지, 언제 먹었는지".
    # - 이 함수는 두 테이블을 MEDI_SCHE_CD + SENIOR_ID + 오늘 날짜로 연결한다.
    # - 오늘 기록이 없거나 TAKING_YN='N'이면 아직 처리 대상이고,
    #   TAKING_YN='Y'면 이미 복약 완료라 다시 울리지 않는다.
    # - 시간 비교는 라즈베리파이 시간이 아니라 DB 서버의 CURTIME()/CURDATE() 기준이다.
    sql = """
        SELECT
          MS.MEDI_SCHE_CD,
          MS.SENIOR_ID,
          MS.PILLBOX_ORDER,
          MS.TAKING_TYPE,
          MS.TAKING_TIME AS TAKING_TIME,
          SC.SCHE_CD,
          SC.TAKING_YN
        FROM TB_MEDICINE_SCHEDULE MS
        LEFT JOIN TB_SCHEDULE SC
          ON SC.MEDI_SCHE_CD = MS.MEDI_SCHE_CD
         AND SC.SENIOR_ID = MS.SENIOR_ID
         AND SC.TAKING_DATE = CURDATE()
        WHERE MS.SENIOR_ID = %s
          AND MS.USE_YN = 'Y'
          AND MS.START_DATE <= CURDATE()
          AND (MS.END_DATE IS NULL OR MS.END_DATE >= CURDATE())
          AND MS.TAKING_TIME >= SUBTIME(CURTIME(), SEC_TO_TIME(%s))
          AND MS.TAKING_TIME <= ADDTIME(CURTIME(), SEC_TO_TIME(%s))
          AND (SC.SCHE_CD IS NULL OR SC.TAKING_YN = 'N')
        ORDER BY MS.TAKING_TIME ASC
    """

    with db_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (senior_id, SCHEDULE_LOOKBACK_SEC, SCHEDULE_EARLY_SEC))
        rows = fetch_all_dict(cur)

    schedules = []

    for row in rows:
        schedules.append(
            MedicineSchedule(
                medi_sche_cd=int(row["MEDI_SCHE_CD"]),
                senior_id=row["SENIOR_ID"],
                pillbox_order=int(row["PILLBOX_ORDER"]),
                taking_type=row["TAKING_TYPE"],
                taking_time=str(row["TAKING_TIME"]),
                sche_cd=row.get("SCHE_CD"),
            )
        )

    return schedules


def get_db_datetime_info() -> Optional[Dict]:
    """
    fetch_due_schedules()는 DB의 CURTIME()/CURDATE()를 기준으로 동작한다.
    그래서 라즈베리파이 시간이 맞아도 DB 서버 시간이 다르면 found=0이 될 수 있다.
    """
    sql = """
        SELECT
          NOW() AS DB_NOW,
          CURDATE() AS DB_DATE,
          CURTIME() AS DB_TIME
    """

    try:
        with db_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql)
            return fetch_one_dict(cur)
    except Exception as exc:
        print(f"[WARN] DB time check failed: {exc}")
        return None


def print_schedule_debug(senior_id: str):
    """
    found=0일 때 왜 스케줄이 안 잡히는지 확인하기 위한 진단 로그.
    """
    db_info = get_db_datetime_info()

    if db_info:
        debug_log(
            f"[DEBUG] DB time now={db_info.get('DB_NOW')}, "
            f"db_time={db_info.get('DB_TIME')}, "
            f"pi_time={datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )

    sql = """
        SELECT
          MS.MEDI_SCHE_CD,
          MS.SENIOR_ID,
          MS.PILLBOX_ORDER,
          MS.TAKING_TYPE,
          MS.TAKING_TIME,
          MS.USE_YN,
          MS.START_DATE,
          MS.END_DATE,
          SC.SCHE_CD,
          SC.TAKING_YN,
          SC.TAKEN_TIME,
          CASE
            WHEN MS.USE_YN <> 'Y' THEN 'USE_YN_NOT_Y'
            WHEN MS.START_DATE > CURDATE() THEN 'START_DATE_FUTURE'
            WHEN MS.END_DATE IS NOT NULL AND MS.END_DATE < CURDATE() THEN 'END_DATE_PAST'
            WHEN SC.SCHE_CD IS NOT NULL AND SC.TAKING_YN = 'Y' THEN 'ALREADY_TAKEN'
            WHEN MS.TAKING_TIME < SUBTIME(CURTIME(), SEC_TO_TIME(%s)) THEN 'TIME_TOO_OLD'
            WHEN MS.TAKING_TIME > ADDTIME(CURTIME(), SEC_TO_TIME(%s)) THEN 'TIME_TOO_FUTURE'
            ELSE 'SHOULD_BE_FOUND'
          END AS REASON
        FROM TB_MEDICINE_SCHEDULE MS
        LEFT JOIN TB_SCHEDULE SC
          ON SC.MEDI_SCHE_CD = MS.MEDI_SCHE_CD
         AND SC.SENIOR_ID = MS.SENIOR_ID
         AND SC.TAKING_DATE = CURDATE()
        WHERE MS.SENIOR_ID = %s
        ORDER BY ABS(TIME_TO_SEC(TIMEDIFF(MS.TAKING_TIME, CURTIME()))) ASC
        LIMIT 5
    """

    try:
        with db_conn() as conn:
            cur = conn.cursor()
            cur.execute(sql, (SCHEDULE_LOOKBACK_SEC, SCHEDULE_EARLY_SEC, senior_id))
            rows = fetch_all_dict(cur)

        if not rows:
            debug_log(f"[DEBUG] no TB_MEDICINE_SCHEDULE rows for senior={senior_id}")
            return

        for row in rows:
            debug_log(
                "[DEBUG] schedule candidate "
                f"medi_sche_cd={row.get('MEDI_SCHE_CD')}, "
                f"slot={row.get('PILLBOX_ORDER')}, "
                f"taking_time={row.get('TAKING_TIME')}, "
                f"use_yn={row.get('USE_YN')}, "
                f"start={row.get('START_DATE')}, end={row.get('END_DATE')}, "
                f"sche_cd={row.get('SCHE_CD')}, "
                f"taking_yn={row.get('TAKING_YN')}, "
                f"taken_time={row.get('TAKEN_TIME')}, "
                f"reason={row.get('REASON')}"
            )

    except Exception as exc:
        print(f"[WARN] schedule debug failed: {exc}")


def ensure_today_schedule(schedule: MedicineSchedule) -> int:
    """
    TB_MEDICINE_SCHEDULE 기본 스케줄을 기준으로
    오늘 TB_SCHEDULE 날짜별 복약 기록을 보장한다.

    핵심 수정:
    - 오늘 TB_SCHEDULE 기록이 이미 있어도 그대로 두지 않는다.
    - TB_MEDICINE_SCHEDULE에서 시간/칸을 바꿨으면
      TB_SCHEDULE의 TAKING_TIME, PILLBOX_ORDER, TAKING_TYPE도 같이 동기화한다.
    - 그래야 18:13 스케줄인데 TB_SCHEDULE에는 17:38로 남는 문제가 사라진다.
    """
    find_sql = """
        SELECT SCHE_CD
        FROM TB_SCHEDULE
        WHERE MEDI_SCHE_CD = %s
          AND SENIOR_ID = %s
          AND TAKING_DATE = CURDATE()
        LIMIT 1
    """

    update_sql = """
        UPDATE TB_SCHEDULE
        SET PILLBOX_ORDER = %s,
            TAKING_TYPE = %s,
            TAKING_TIME = %s
        WHERE SCHE_CD = %s
    """

    insert_sql = """
        INSERT INTO TB_SCHEDULE
          (MEDI_SCHE_CD, SENIOR_ID, TAKING_DATE, PILLBOX_ORDER, TAKING_TYPE, TAKING_TIME, TAKING_YN)
        VALUES
          (%s, %s, CURDATE(), %s, %s, %s, 'N')
    """

    with db_conn() as conn:
        cur = conn.cursor()

        cur.execute(find_sql, (schedule.medi_sche_cd, schedule.senior_id))
        row = fetch_one_dict(cur)

        if row:
            sche_cd = int(row["SCHE_CD"])

            # 이미 오늘 기록이 있더라도 기본 스케줄 기준으로 시간/칸을 맞춘다.
            cur.execute(
                update_sql,
                (
                    schedule.pillbox_order,
                    schedule.taking_type,
                    schedule.taking_time,
                    sche_cd,
                ),
            )

            return sche_cd

        cur.execute(
            insert_sql,
            (
                schedule.medi_sche_cd,
                schedule.senior_id,
                schedule.pillbox_order,
                schedule.taking_type,
                schedule.taking_time,
            ),
        )

        return int(cur.lastrowid)


def mark_taken(sche_cd: int):
    sql = """
        UPDATE TB_SCHEDULE
        SET TAKING_YN = 'Y',
            TAKEN_TIME = NOW()
        WHERE SCHE_CD = %s
    """

    with db_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (sche_cd,))


def insert_pillbox_log(senior_id: str, slot_num: int, log_type: str):
    """
    TB_PILLBOX_LOG.LOG_TYPE은 varchar(10)이므로 10자 이하로 잘라 저장한다.

    사용 예:
    - ALARM
    - OPEN
    - CLOSE
    - TAKEN
    - MISSED
    - WEIGHT
    - ERR
    """
    sql = """
        INSERT INTO TB_PILLBOX_LOG
          (SENIOR_ID, SLOT_NUM, LOG_TYPE, LOGGED_AT)
        VALUES
          (%s, %s, %s, NOW())
    """

    with db_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (senior_id, slot_num, log_type[:10]))


def get_alert_receiver_member_id(senior: SeniorInfo) -> Optional[str]:
    """
    TB_ALERT.MEM_ID에 넣을 회원 ID 조회.
    우선 보호자 MEM_ID를 사용한다.
    """
    if senior.guardian_id:
        return senior.guardian_id

    sql = "SELECT MEM_ID FROM TB_MEMBER WHERE MEM_ID = %s LIMIT 1"

    with db_conn() as conn:
        cur = conn.cursor()
        cur.execute(sql, (senior.senior_id,))
        row = fetch_one_dict(cur)

    return row["MEM_ID"] if row else None


def insert_alert(
    senior: SeniorInfo,
    alert_type: str,
    message: str,
    sche_cd: Optional[int] = None,
):
    """
    TB_ALERT에 알림 저장.
    TB_ALERT는 SCHE_CD + ALERT_TYPE unique가 있으므로
    같은 스케줄의 같은 알림은 중복 생성하지 않고 갱신한다.
    """
    mem_id = get_alert_receiver_member_id(senior)

    if not mem_id:
        print("[WARN] TB_ALERT.MEM_ID에 넣을 수 있는 회원 ID를 찾지 못했습니다.")
        return

    sql = """
        INSERT INTO TB_ALERT
          (MEM_ID, SENIOR_ID, ALERT_TYPE, ALERT_MSG, ALERT_TIME, IS_RECEIVED, CREATED_AT, SCHE_CD)
        VALUES
          (%s, %s, %s, %s, NOW(), 'N', NOW(), %s)
        ON DUPLICATE KEY UPDATE
          ALERT_MSG = VALUES(ALERT_MSG),
          ALERT_TIME = NOW(),
          IS_RECEIVED = 'N',
          CREATED_AT = NOW()
    """

    with db_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            sql,
            (
                mem_id,
                senior.senior_id,
                alert_type[:30],
                message,
                sche_cd,
            ),
        )


# =========================================================
# SMS
# =========================================================

def normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None

    cleaned = "".join(ch for ch in str(phone) if ch.isdigit())
    return cleaned or None


def send_sms(to_phone: Optional[str], message: str) -> bool:
    """
    SOLAPI 문자 발송.

    기본값은 SMS_DRY_RUN=1이라 실제 발송하지 않고 콘솔에만 출력한다.

    실제 발송 실행 예:
      SOLAPI_API_KEY="발급받은키" \
      SOLAPI_API_SECRET="발급받은시크릿" \
      SMS_SENDER_PHONE="솔라피등록발신번호" \
      SMS_DRY_RUN=0 \
      python3 load_cell_jaebal.py
    """
    if stop_event.is_set():
        print("[INFO] SMS skipped because shutdown is in progress.")
        return False

    to_phone = normalize_phone(to_phone)
    from_phone = normalize_phone(SMS_SENDER_PHONE)

    if not to_phone:
        print("[WARN] SMS receiver phone is empty.")
        return False

    if not from_phone:
        print("[WARN] SMS sender phone is empty.")
        return False

    if SMS_DRY_RUN:
        print(f"[SMS-DRY-RUN] from={from_phone} to={to_phone} msg={message}")
        return True

    if not validate_sms_config(log=True):
        print("[WARN] SOLAPI SMS send skipped because config is not valid.")
        return False

    try:
        message_service = SolapiMessageService(
            api_key=SOLAPI_API_KEY,
            api_secret=SOLAPI_API_SECRET,
        )

        sms_message = RequestMessage(
            from_=from_phone,
            to=to_phone,
            text=message,
        )

        response = message_service.send(sms_message)

        try:
            group_id = response.group_info.group_id
            total = response.group_info.count.total
            success = response.group_info.count.registered_success
            failed = response.group_info.count.registered_failed

            print(
                f"[SMS] SOLAPI send requested "
                f"group_id={group_id}, total={total}, success={success}, failed={failed}"
            )
        except Exception:
            print("[SMS] SOLAPI send requested.")

        return True

    except Exception as exc:
        print(f"[WARN] SOLAPI SMS send failed to={to_phone}: {exc}")
        return False


def send_missed_sms(senior: SeniorInfo, schedule: MedicineSchedule):
    if stop_event.is_set():
        print("[INFO] missed SMS skipped because shutdown is in progress.")
        return

    msg = (
        f"[복약안심서비스] {senior.senior_name}님 "
        f"{schedule.taking_type} {schedule.taking_time[:5]} 복약이 확인되지 않았습니다."
    )

    # 대상자와 보호자 모두에게 발송
    receivers = {
        normalize_phone(senior.senior_phone),
        normalize_phone(senior.guardian_phone),
    }

    for phone in receivers:
        if phone:
            send_sms(phone, msg)


# =========================================================
# I2C HX711 로드셀
# =========================================================

class I2CLoadCell:
    """
    DFRobot I2C HX711 로드셀 하나.

    핵심:
    - 네가 성공했던 방식 그대로 초기화한다.
    - begin() 반환값 검사하지 않는다.
    - setup 단계에서 read_weight 실패로 센서를 버리지 않는다.
    """

    def __init__(self, slot_num: int, address: int):
        self.slot_num = slot_num
        self.address = address
        self.sensor = None
        self.last_setup_attempt_at = 0.0

    def setup(self) -> bool:
        if hx is None:
            print(f"[WARN] DFRobot_HX711_I2C import failed: {HX711_IMPORT_ERROR}")
            return False

        last_error = None

        for attempt in range(1, LOADCELL_SETUP_RETRY_COUNT + 1):
            try:
                print(
                    f"[INFO] setup loadcell slot={self.slot_num}, "
                    f"addr=0x{self.address:02x}, attempt={attempt}/{LOADCELL_SETUP_RETRY_COUNT}"
                )

                # 실패한 센서 객체를 재사용하지 않고 매번 새로 만든다.
                self.sensor = hx.DFRobot_HX711_I2C(IIC_MODE, self.address)

                # DFRobot begin() 반환값은 검사하지 않는다.
                # 예전 성공 코드와 동일하게 예외가 안 나면 성공으로 본다.
                self.sensor.begin()

                print(f"[OK] loadcell initialized slot={self.slot_num}, addr=0x{self.address:02x}")
                return True

            except Exception as exc:
                last_error = exc
                self.sensor = None
                print(
                    f"[WARN] loadcell setup retry failed "
                    f"slot={self.slot_num}, addr=0x{self.address:02x}, "
                    f"attempt={attempt}/{LOADCELL_SETUP_RETRY_COUNT}: {exc}"
                )
                time.sleep(LOADCELL_SETUP_RETRY_DELAY_SEC)

        print(
            f"[ERROR] loadcell setup failed "
            f"slot={self.slot_num}, addr=0x{self.address:02x}: {last_error}"
        )
        self.sensor = None
        return False

    def read_weight(self) -> Optional[float]:
        if self.sensor is None:
            now = time.time()
            if now - self.last_setup_attempt_at < 2.0:
                return None
            self.last_setup_attempt_at = now
            if not self.setup():
                return None

        last_error = None

        for _ in range(LOADCELL_READ_RETRY_COUNT):
            try:
                if SUPPRESS_HX711_LIBRARY_PRINTS:
                    with redirect_stdout(io.StringIO()):
                        value = self.sensor.read_weight(LOADCELL_READ_TIMES)
                else:
                    value = self.sensor.read_weight(LOADCELL_READ_TIMES)

                return float(value)

            except Exception as exc:
                last_error = exc
                time.sleep(LOADCELL_READ_RETRY_DELAY_SEC)

        print(
            f"[WARN] HX711 read_weight failed "
            f"slot={self.slot_num}, addr=0x{self.address:02x}: {last_error}"
        )
        return None


# =========================================================
# 하드웨어 제어
# =========================================================

class Hardware:
    def __init__(self):
        self.lcd = None
        self.buzzer_pwm = None
        self.pixel_strip = None
        self.scales: Dict[int, I2CLoadCell] = {}

        self.lock = threading.Lock()
        self.i2c_lock = threading.Lock()
        self.last_lcd_text = None

        # 문 상태 상세 로그가 너무 빠르게 쏟아지지 않도록 마지막 출력 상태를 저장한다.
        self.last_door_debug_state: Dict[int, Tuple[int, int, bool, bool, str, str]] = {}
        self.last_door_debug_time: Dict[int, float] = {}

    def setup(self):
        print("================================")
        print(" Hardware setup start")
        print("================================")

        self.setup_gpio()
        self.startup_door_self_check()

        # 중요:
        # LCD와 HX711 로드셀은 같은 1번 I2C 버스를 공유한다.
        # 주소 스캔에 장치가 보여도 LCD 객체를 먼저 잡은 뒤 HX711 begin()을 하면
        # 간헐적으로 모든 로드셀이 입출력 오류로 실패할 수 있다.
        # 그래서 로드셀을 먼저 초기화하고, LCD는 그 다음에 초기화한다.
        self.setup_loadcells()

        if LOADCELL_STARTUP_SELF_CHECK:
            self.startup_loadcell_self_check()

        self.setup_lcd()

        print("================================")
        print(" Hardware setup done")
        print("================================")
        print(f"준비된 로드셀: {sorted(self.scales.keys())}")

    def get_gpio_pull_mode(self):
        """
        active-low 구조에서는 PUD_UP이 기본이다.
        - 감지/눌림 = 0
        - 감지 없음/안 눌림 = 1
        최종 문 상태는 reed/micro 두 입력을 조합해서 판단한다.
        회로가 반대로 되어 있는 경우만 환경변수 DOOR_PULL_MODE=down을 사용한다.
        """
        if GPIO is None:
            return None

        if DOOR_PULL_MODE == "up":
            return GPIO.PUD_UP

        return GPIO.PUD_DOWN

    def setup_gpio(self):
        if GPIO is None:
            print(f"[WARN] RPi.GPIO not available: {GPIO_IMPORT_ERROR}")
            print("[WARN] GPIO 기능은 비활성화됩니다.")
            return

        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)

        GPIO.setup(BUZZER_PIN, GPIO.OUT)
        GPIO.output(BUZZER_PIN, GPIO.LOW)
        self.buzzer_pwm = GPIO.PWM(BUZZER_PIN, BUZZER_PWM_FREQ)

        print(
            f"[INFO] BUZZER GPIO={BUZZER_PIN}, "
            f"freq={BUZZER_PWM_FREQ}, duty={BUZZER_DUTY_CYCLE}"
        )

        if USE_WS2812:
            self.setup_ws2812()
        else:
            # LED 하나를 모든 슬롯이 공유할 수 있으므로 중복 GPIO 초기화를 피한다.
            for pin in sorted(set(LED_PINS.values())):
                GPIO.setup(pin, GPIO.OUT)
                GPIO.output(pin, GPIO.LOW)
                print(f"[INFO] LED GPIO={pin}")

        door_pull = self.get_gpio_pull_mode()

        for slot, pin in REED_PINS.items():
            GPIO.setup(pin, GPIO.IN, pull_up_down=door_pull)
            print(f"[INFO] REED slot={slot}, GPIO={pin}, pull={DOOR_PULL_MODE}")

        GPIO.setup(MICRO_SWITCH_PIN, GPIO.IN, pull_up_down=door_pull)
        print(f"[INFO] MICRO GPIO={MICRO_SWITCH_PIN}, pull={DOOR_PULL_MODE}")

    def setup_ws2812(self):
        """
        WS2812B 8구 LED 바를 초기화한다.

        배선 기준:
        - LED 5V는 라즈베리파이 5V 또는 안정적인 외부 5V 전원에 연결한다.
        - LED GND는 라즈베리파이 GND와 반드시 공통 접지로 연결한다.
        - LED DIN은 WS2812_PIN에 연결한다. 기본값은 BCM GPIO12, 물리핀 32번이다.
        - GPIO 핀은 데이터 신호용이며, LED 전원 공급용으로 쓰면 안 된다.

        실행 기준:
        - rpi_ws281x는 /dev/mem 접근이 필요하므로 sudo 실행이 필요하다.
        - 잘못된 핀을 사용하면 라이브러리 오류가 날 수 있어 지원 핀을 먼저 검사한다.
        """
        if PixelStrip is None or Color is None:
            print(f"[WARN] WS2812 library unavailable: {WS2812_IMPORT_ERROR}")
            print("[WARN] Falling back to GPIO LED mode.")
            return

        if hasattr(os, "geteuid") and os.geteuid() != 0:
            print(
                "[WARN] WS2812 requires root access to /dev/mem. "
                "Run with: sudo -E python3 /home/pi/zinzzajabal.py"
            )
            print("[WARN] WS2812 disabled for this non-root run.")
            return

        used_gpio = {
            BUZZER_PIN: "buzzer",
            MICRO_SWITCH_PIN: "micro",
            **{pin: f"reed slot {slot}" for slot, pin in REED_PINS.items()},
        }

        if WS2812_PIN in used_gpio:
            print(
                f"[WARN] WS2812_PIN={WS2812_PIN} conflicts with {used_gpio[WS2812_PIN]}. "
                "Falling back to GPIO LED mode."
            )
            return

        if WS2812_PIN not in WS2812_SUPPORTED_PINS:
            print(
                f"[WARN] WS2812_PIN={WS2812_PIN} is not supported by rpi_ws281x. "
                "Use BCM12 / physical pin 32 for this project."
            )
            return

        brightness = max(0, min(255, WS2812_BRIGHTNESS))

        try:
            self.pixel_strip = PixelStrip(
                WS2812_LED_COUNT,
                WS2812_PIN,
                WS2812_FREQ_HZ,
                WS2812_DMA,
                WS2812_INVERT,
                brightness,
                WS2812_CHANNEL,
            )
            self.pixel_strip.begin()
            self.ws2812_clear()
            print(
                f"[INFO] WS2812 initialized count={WS2812_LED_COUNT}, "
                f"pin=GPIO{WS2812_PIN}, brightness={brightness}/255"
            )
        except Exception as exc:
            self.pixel_strip = None
            print(f"[WARN] WS2812 init failed: {exc}")
            print("[WARN] Falling back to GPIO LED mode.")

    def ws2812_color(self, rgb: Tuple[int, int, int]):
        red, green, blue = rgb
        return Color(red, green, blue)

    def ws2812_show_slot(self, slot_num: int, on: bool):
        if self.pixel_strip is None:
            return False

        try:
            if not on:
                self.ws2812_clear()
                print(f"[INFO] WS2812 OFF slot={slot_num}")
                return True

            rgb = WS2812_SLOT_COLORS.get(slot_num, (255, 255, 255))
            color = self.ws2812_color(rgb)
            pixels_per_slot = max(1, WS2812_LED_COUNT // 4)
            start = min(WS2812_LED_COUNT, max(0, (slot_num - 1) * pixels_per_slot))
            end = min(WS2812_LED_COUNT, start + pixels_per_slot)

            self.ws2812_clear(show=False)

            for index in range(start, end):
                self.pixel_strip.setPixelColor(index, color)

            self.pixel_strip.show()
            print(
                f"[INFO] WS2812 ON slot={slot_num}, "
                f"pixels={start}-{max(start, end) - 1}, rgb={rgb}"
            )
            return True
        except Exception as exc:
            print(f"[WARN] WS2812 control failed slot={slot_num}: {exc}")
            return False

    def ws2812_clear(self, show: bool = True):
        if self.pixel_strip is None:
            return

        for index in range(WS2812_LED_COUNT):
            self.pixel_strip.setPixelColor(index, Color(0, 0, 0))

        if show:
            self.pixel_strip.show()

    def setup_lcd(self):
        if CharLCD is None:
            print(f"[WARN] RPLCD library not available: {LCD_IMPORT_ERROR}")
            print("[WARN] LCD는 콘솔 출력만 사용합니다.")
            return

        try:
            self.lcd = CharLCD(
                i2c_expander="PCF8574",
                address=LCD_I2C_ADDRESS,
                port=1,
                cols=LCD_COLS,
                rows=LCD_ROWS,
            )
            self.lcd.clear()
            print(f"[INFO] LCD initialized addr=0x{LCD_I2C_ADDRESS:02x}")
        except Exception as exc:
            print(f"[WARN] LCD init failed: {exc}")
            self.lcd = None

    def setup_loadcells(self):
        if hx is None:
            print(f"[WARN] HX711 library unavailable: {HX711_IMPORT_ERROR}")
            return

        for slot, address in LOADCELL_I2C_ADDRESSES.items():
            scale = I2CLoadCell(slot_num=slot, address=address)

            with self.i2c_lock:
                ok = scale.setup()

            self.scales[slot] = scale

            if not ok:
                print(
                    f"[WARN] loadcell setup failed at startup slot={slot}, addr=0x{address:02x}. "
                    "Keeping it registered and retrying on reads."
                )

            # 같은 I2C 버스에 HX711 4개가 붙어 있어서 연속 begin() 사이에 짧은 대기
            time.sleep(LOADCELL_SETUP_BETWEEN_DELAY_SEC)

        print(f"[INFO] loadcells registered: {sorted(self.scales.keys())}")

    def startup_loadcell_self_check(self):
        print()
        print("================================")
        print(" Loadcell startup self-check")
        print("================================")

        if not self.scales:
            print("[WARN] 등록된 로드셀이 없습니다.")
            print("================================")
            print()
            return

        time.sleep(0.5)

        success_count_by_slot = {slot: 0 for slot in self.scales.keys()}

        for round_idx in range(1, LOADCELL_STARTUP_SELF_CHECK_ROUNDS + 1):
            line_values = []

            for slot in sorted(self.scales.keys()):
                value = self.read_weight(slot)

                if value is None:
                    line_values.append(f"S{slot}=ERR")
                else:
                    success_count_by_slot[slot] += 1
                    line_values.append(f"S{slot}={value:.2f}g")

                time.sleep(LOADCELL_STARTUP_SELF_CHECK_DELAY_SEC)

            print(
                f"[LOADCELL CHECK {round_idx}/{LOADCELL_STARTUP_SELF_CHECK_ROUNDS}] "
                + " | ".join(line_values)
            )

        readable_slots = [
            slot for slot, count in success_count_by_slot.items()
            if count > 0
        ]

        print(f"[INFO] startup readable loadcells: {readable_slots}")

        if len(readable_slots) != len(self.scales):
            print("[WARN] 일부 로드셀이 시작 확인에서 값을 못 읽었습니다.")
            print("[WARN] 그래도 센서를 제거하지 않고 복약 시점에 다시 읽습니다.")

        print("================================")
        print()

    def cleanup(self):
        try:
            self.alarm_off_all()
        except Exception:
            pass

        try:
            self.lcd_message("")
        except Exception:
            pass

        if self.buzzer_pwm is not None:
            try:
                self.buzzer_pwm.stop()
            except Exception:
                pass

        if self.lcd is not None:
            try:
                self.lcd.clear()
            except Exception:
                pass

        if self.pixel_strip is not None and WS2812_CLEAR_ON_EXIT:
            try:
                self.ws2812_clear()
            except Exception:
                pass

        if GPIO is not None:
            try:
                GPIO.cleanup()
            except Exception:
                pass

    def lcd_message(self, line1: str, line2: str = ""):
        print(f"[LCD] {line1} | {line2}")

        if self.lcd is None:
            return

        # LCD와 로드셀이 같은 I2C 버스에 있으므로 같은 잠금 객체로 보호한다.
        with self.i2c_lock:
            line1 = line1[:LCD_COLS].ljust(LCD_COLS)
            line2 = line2[:LCD_COLS].ljust(LCD_COLS)

            current_text = (line1, line2)

            if current_text == self.last_lcd_text:
                return

            self.last_lcd_text = current_text

            try:
                self.lcd.cursor_pos = (0, 0)
                self.lcd.write_string(line1)

                self.lcd.cursor_pos = (1, 0)
                self.lcd.write_string(line2)

            except Exception as exc:
                print(f"[WARN] LCD write failed: {exc}")

    def buzzer(self, on: bool):
        if GPIO is None:
            print(f"[DRY] BUZZER {'ON' if on else 'OFF'}")
            return

        with self.lock:
            if self.buzzer_pwm is None:
                print("[WARN] buzzer PWM is not initialized.")
                return

            try:
                if on:
                    self.buzzer_pwm.start(BUZZER_DUTY_CYCLE)
                else:
                    self.buzzer_pwm.stop()
                    GPIO.output(BUZZER_PIN, GPIO.LOW)
            except Exception as exc:
                print(f"[WARN] buzzer control failed: {exc}")

    def led(self, slot_num: int, on: bool):
        if self.pixel_strip is not None:
            if self.ws2812_show_slot(slot_num, on):
                return

        if GPIO is None:
            print(f"[DRY] LED slot={slot_num} {'ON' if on else 'OFF'}")
            return

        if USE_WS2812:
            print("[WARN] WS2812 requested but unavailable; GPIO fallback LED is disabled.")
            return

        pin = LED_PINS.get(slot_num)

        if pin is None:
            print(f"[WARN] invalid LED slot={slot_num}")
            return

        try:
            GPIO.output(pin, GPIO.HIGH if on else GPIO.LOW)
            print(f"[INFO] LED {'ON' if on else 'OFF'} slot={slot_num}, GPIO={pin}")
        except Exception as exc:
            print(f"[WARN] LED control failed slot={slot_num}: {exc}")

    def alarm_on(self, schedule: MedicineSchedule):
        self.led(schedule.pillbox_order, True)
        self.buzzer(True)
        self.lcd_message(
            "Take medicine",
            f"Slot {schedule.pillbox_order} {schedule.taking_time[:5]}",
        )

    def alarm_off_slot(self, slot_num: int):
        self.led(slot_num, False)
        self.buzzer(False)

    def alarm_off_all(self):
        self.buzzer(False)

        if self.pixel_strip is not None:
            self.ws2812_clear()
            return

        if USE_WS2812:
            return

        if GPIO is None:
            return

        for pin in set(LED_PINS.values()):
            try:
                GPIO.output(pin, GPIO.LOW)
            except Exception as exc:
                print(f"[WARN] LED off failed GPIO={pin}: {exc}")

    def is_open_by_value(self, value: int) -> bool:
        return int(value) == DOOR_OPEN_VALUE_RAW

    def read_door_state(self, slot_num: int) -> Tuple[bool, int, int, bool, bool]:
        """
        문 센서 원시값을 읽고 문 열림 여부를 계산한다.

        반환:
        - door_open
        - reed_value
        - micro_value
        - reed_open
        - micro_open
        """
        if GPIO is None:
            return False, 0, 0, False, False

        reed_pin = REED_PINS.get(slot_num)

        if reed_pin is None:
            print(f"[WARN] invalid slot_num={slot_num}. Door check skipped.")
            return False, 0, 0, False, False

        reed_value = GPIO.input(reed_pin)
        micro_value = GPIO.input(MICRO_SWITCH_PIN)

        reed_open = self.is_open_by_value(reed_value)
        micro_open = self.is_open_by_value(micro_value)

        if DOOR_OPEN_MODE == "reed_only":
            door_open = reed_open
        elif DOOR_OPEN_MODE == "reed_or_micro":
            door_open = reed_open or micro_open
        else:
            # 기본값: reed_and_micro
            # 리드스위치와 마이크로스위치가 둘 다 열림 상태일 때만 문 열림으로 판단한다.
            door_open = reed_open and micro_open

        return door_open, reed_value, micro_value, reed_open, micro_open

    def print_door_debug_if_needed(
        self,
        slot_num: int,
        reed_value: int,
        micro_value: int,
        reed_open: bool,
        micro_open: bool,
        force: bool = False,
    ):
        if not (VERBOSE_DEBUG or force):
            return

        now_ts = time.time()
        debug_state = (reed_value, micro_value, reed_open, micro_open, DOOR_OPEN_MODE, DOOR_PULL_MODE)
        prev_state = self.last_door_debug_state.get(slot_num)
        prev_time = self.last_door_debug_time.get(slot_num, 0)

        if (
            force
            or prev_state != debug_state
            or now_ts - prev_time >= DOOR_DEBUG_PRINT_INTERVAL_SEC
        ):
            print(
                f"[DEBUG] door slot={slot_num}, "
                f"reed_pin={REED_PINS.get(slot_num)}, reed={reed_value}, reed_open={reed_open}, "
                f"micro={micro_value}, micro_open={micro_open}, "
                f"mode={DOOR_OPEN_MODE}, open_value={DOOR_OPEN_VALUE_RAW}, "
                f"closed_value={1 - DOOR_OPEN_VALUE_RAW if DOOR_OPEN_VALUE_RAW in (0, 1) else 'unknown'}, "
                f"pull={DOOR_PULL_MODE}"
            )
            self.last_door_debug_state[slot_num] = debug_state
            self.last_door_debug_time[slot_num] = now_ts

    def is_door_open(self, slot_num: int, force_log: bool = False) -> bool:
        door_open, reed_value, micro_value, reed_open, micro_open = self.read_door_state(slot_num)

        self.print_door_debug_if_needed(
            slot_num=slot_num,
            reed_value=reed_value,
            micro_value=micro_value,
            reed_open=reed_open,
            micro_open=micro_open,
            force=force_log,
        )

        return door_open

    def is_door_open_stable(self, slot_num: int) -> bool:
        """
        순간 노이즈를 문 열림으로 오판하지 않도록
        연속 DOOR_OPEN_STABLE_COUNT번 열림이어야 True.
        """
        open_count = 0

        for _ in range(DOOR_OPEN_STABLE_COUNT):
            if self.is_door_open(slot_num):
                open_count += 1
            time.sleep(DOOR_OPEN_STABLE_DELAY_SEC)

        return open_count >= DOOR_OPEN_STABLE_COUNT

    def startup_door_self_check(self):
        """
        프로그램 시작 직후 현재 문 센서 값을 한 번 출력한다.
        최종 기준:
        - 닫힘 = reed=0(자석 감지), micro=0(눌림)
        - 열림 = reed=1(자석 감지 없음), micro=1(안 눌림)
        """
        print()
        print("================================")
        print(" Door startup self-check")
        print(" expected closed: reed=0, micro=0")
        print(" expected open:   reed=1, micro=1")
        print("================================")

        for slot in sorted(REED_PINS.keys()):
            door_open, reed_value, micro_value, reed_open, micro_open = self.read_door_state(slot)
            self.print_door_debug_if_needed(
                slot_num=slot,
                reed_value=reed_value,
                micro_value=micro_value,
                reed_open=reed_open,
                micro_open=micro_open,
                force=True,
            )

            if door_open:
                print(
                    f"[WARN] startup door state is OPEN for slot={slot}. "
                    f"If the door is actually closed, check wiring or DOOR_PULL_MODE."
                )

        print("================================")
        print()

    def wait_until_door_closed(self, slot_num: int, timeout_sec: int = 10):
        """
        문 닫힘을 기다린다.
        문 닫힘 감지가 완벽하지 않아도 전체 복약 로직이 멈추지 않도록 timeout을 둔다.
        """
        end_at = time.time() + timeout_sec

        while time.time() < end_at and not stop_event.is_set():
            if not self.is_door_open(slot_num):
                return True

            time.sleep(0.2)

        return False

    def read_weight(self, slot_num: int) -> Optional[float]:
        scale = self.scales.get(slot_num)

        if scale is None:
            print(f"[WARN] loadcell not available slot={slot_num}")
            return None

        with self.i2c_lock:
            return scale.read_weight()

    def read_stable_weight(
        self,
        slot_num: int,
        samples: int = STABLE_WEIGHT_SAMPLES,
        delay_sec: float = STABLE_WEIGHT_DELAY_SEC,
        trim_ratio: float = STABLE_WEIGHT_TRIM_RATIO,
        warn_on_failure: bool = True,
        apply_zero_deadband: bool = True,
    ) -> Optional[float]:
        values = []

        for _ in range(samples):
            if stop_event.is_set():
                return None

            value = self.read_weight(slot_num)

            if value is not None and abs(value) < LOADCELL_ABSOLUTE_OUTLIER_LIMIT_GRAM:
                values.append(float(value))

            time.sleep(delay_sec)

        min_valid_count = max(5, samples // 3)

        if len(values) < min_valid_count:
            if warn_on_failure and not stop_event.is_set():
                print(
                    f"[WARN] stable weight failed slot={slot_num}, "
                    f"valid_samples={len(values)}/{samples}"
                )
            return None

        values.sort()

        trim_count = int(len(values) * trim_ratio)

        if trim_count > 0 and len(values) > trim_count * 2:
            values = values[trim_count:-trim_count]

        median_value = statistics.median(values)

        # HX711은 시작 기준점과 온도/진동 때문에 빈 칸 근처에서
        # -0.04g 같은 작은 음수가 흔하다. 진단/표시 경로에서는 작은 영점 흔들림만 0으로 맞춘다.
        # 복약 판단 경로는 아주 가벼운 약 무게도 봐야 하므로 영점 보정 없이 중앙값을 쓴다.
        if apply_zero_deadband and abs(median_value) < WEIGHT_ZERO_DEADBAND_GRAM:
            return 0.0

        return median_value


# =========================================================
# 메인 복약 로직
# =========================================================

def heartbeat_loop():
    while not stop_event.is_set():
        try:
            upsert_power_status("Y")
        except Exception as exc:
            print(f"[WARN] heartbeat failed: {exc}")

        stop_event.wait(HEARTBEAT_INTERVAL_SEC)


def monitor_weight_after_open(
    hw: Hardware,
    senior: SeniorInfo,
    schedule: MedicineSchedule,
    sche_cd: int,
    baseline: Optional[float],
) -> bool:
    """
    문이 열린 뒤 즉시 로드셀로 약 유무 판단.

    정상 복약 완료 조건:
    - 문 열림은 무게 감지 시작 트리거다.
    - 문 닫힘은 복약 완료 조건이 아니다.
    - 문이 열린 상태든 닫힌 상태든 baseline보다 무게가 충분히 감소하면 복약 완료다.
    - 문 닫힘은 감지되면 CLOSE 로그만 남긴다.

    센서 안전장치:
    - reed + micro 둘 다 열림일 때만 문 열림으로 판단한다.
    - -32g 같은 튐값 1번으로 복약 완료 처리하지 않는다.
    - TAKEN_CONFIRM_COUNT번 연속으로 정상 범위의 무게 감소가 나와야 복약 완료 처리한다.
    """
    # 핵심 요구사항 구현 위치:
    # - OPEN 로그는 여기서 바로 남긴다.
    # - 문 열림 직후부터 로드셀 측정을 시작한다.
    # - 문 닫힘을 기다리는 함수를 호출하지 않는다.
    # - 복약 완료 조건은 "문 닫힘"이 아니라 "기준 무게 대비 무게 감소"다.
    # - 문이 닫히면 CLOSE 로그만 남길 수 있고, TAKEN 판단에는 영향을 주지 않는다.
    slot_num = schedule.pillbox_order
    deadline = datetime.now() + timedelta(minutes=WEIGHT_MONITOR_AFTER_OPEN_MIN)

    insert_pillbox_log(senior.senior_id, slot_num, "OPEN")

    # 문이 열리면 부저는 끄되, LED는 복약 완료/미복약 확정 전까지 계속 켜둔다.
    # 기존에는 여기서 슬롯 알림 끄기 함수를 호출해 LED까지 바로 꺼져서
    # 눈으로 보기엔 LED가 안 켜진 것처럼 보일 수 있었다.
    hw.buzzer(False)
    hw.lcd_message("Door opened", f"Slot {slot_num}")
    print(f"[INFO] door opened. starting weight monitor immediately slot={slot_num}")

    if stop_event.is_set():
        print(f"[INFO] weight monitor aborted by shutdown slot={slot_num}")
        return False

    if baseline is None:
        print("[WARN] pre-open baseline unavailable. Trying immediate open-time baseline.")
        hw.lcd_message("Weight checking", f"Slot {slot_num}")
        baseline = hw.read_stable_weight(
            slot_num,
            samples=20,
            delay_sec=STABLE_WEIGHT_DELAY_SEC,
            trim_ratio=STABLE_WEIGHT_TRIM_RATIO,
            apply_zero_deadband=False,
        )

    if stop_event.is_set():
        print(f"[INFO] weight monitor aborted by shutdown slot={slot_num}")
        return False

    if baseline is None:
        print("[WARN] baseline unavailable. Weight cannot confirm taking.")
        insert_pillbox_log(senior.senior_id, slot_num, "ERR")
        return False

    print(f"[INFO] baseline slot={slot_num}, weight={baseline:.2f}g")
    near_zero_baseline = abs(baseline) < NEAR_ZERO_BASELINE_GRAM
    if near_zero_baseline:
        # DFRobot HX711 begin()은 현재 하중을 영점으로 잡는다.
        # 그래서 약을 올린 상태로 프로그램을 시작하면 기준 무게가 0g 근처가 될 수 있다.
        # 현재 보호 로직은 이 경우에도 아주 가벼운 약은 감지하되, 큰 음수 드리프트는 WEIGHTERR로 버린다.
        print(
            f"[WARN] baseline near zero. using guarded light-dose detection "
            f"slot={slot_num}, baseline={baseline:.2f}g, "
            f"near_zero={NEAR_ZERO_BASELINE_GRAM:.2f}g, "
            f"max_drop={NEAR_ZERO_MAX_TAKEN_WEIGHT_DROP_GRAM:.2f}g, "
            f"confirm={NEAR_ZERO_TAKEN_CONFIRM_COUNT}. "
            "DFRobot HX711 begin() tares the current load, so if the program "
            "started with medicine already on the scale, the pre-alarm baseline "
            "can be close to 0g. Large drops are ignored to avoid false positives."
        )
    hw.lcd_message("Checking dose", f"Slot {slot_num}")

    confirm_count = 0
    close_logged = False
    last_door_open = True
    last_weighterr_log_at = 0.0
    last_read_warn_at = 0.0
    taken_weight_drop_gram = get_taken_weight_drop_gram(slot_num)
    max_taken_drop_gram = (
        NEAR_ZERO_MAX_TAKEN_WEIGHT_DROP_GRAM
        if near_zero_baseline
        else MAX_TAKEN_WEIGHT_DROP_GRAM
    )
    required_confirm_count = (
        max(TAKEN_CONFIRM_COUNT, NEAR_ZERO_TAKEN_CONFIRM_COUNT)
        if near_zero_baseline
        else TAKEN_CONFIRM_COUNT
    )

    while datetime.now() < deadline and not stop_event.is_set():
        door_open_now, _, _, _, _ = hw.read_door_state(slot_num)

        if last_door_open and not door_open_now and not close_logged:
            print(f"[INFO] door closed during weight monitor slot={slot_num}")
            insert_pillbox_log(senior.senior_id, slot_num, "CLOSE")
            close_logged = True

        last_door_open = door_open_now

        current = hw.read_stable_weight(
            slot_num,
            samples=20,
            delay_sec=STABLE_WEIGHT_DELAY_SEC,
            trim_ratio=STABLE_WEIGHT_TRIM_RATIO,
            warn_on_failure=False,
            apply_zero_deadband=False,
        )

        if current is not None:
            diff = baseline - current

            debug_log(
                f"[DEBUG] stable weight slot={slot_num}, "
                f"baseline={baseline:.2f}g, current={current:.2f}g, "
                f"diff={diff:.2f}g, threshold={taken_weight_drop_gram:.2f}g, "
                f"max_drop={max_taken_drop_gram:.2f}g, "
                f"confirm={confirm_count}/{required_confirm_count}"
            )

            # 너무 큰 감소값은 알약 무게가 아니라 센서 튐값으로 본다.
            if diff > max_taken_drop_gram:
                now_ts = time.time()
                if now_ts - last_weighterr_log_at >= 10:
                    print(
                        f"[WARN] suspicious weight drop ignored "
                        f"slot={slot_num}, diff={diff:.2f}g"
                    )
                    insert_pillbox_log(senior.senior_id, slot_num, "WEIGHTERR")
                    last_weighterr_log_at = now_ts
                confirm_count = 0

            elif diff >= taken_weight_drop_gram:
                confirm_count += 1
                print(
                    f"[INFO] weight drop candidate slot={slot_num}, "
                    f"diff={diff:.2f}g, confirm={confirm_count}/{required_confirm_count}"
                )

                if confirm_count >= required_confirm_count:
                    mark_taken(sche_cd)
                    insert_pillbox_log(senior.senior_id, slot_num, "TAKEN")
                    hw.alarm_off_slot(slot_num)
                    hw.lcd_message("Dose checked", f"Slot {slot_num}")
                    time.sleep(2)
                    return True
            else:
                if confirm_count > 0:
                    debug_log(
                        f"[DEBUG] weight confirmation reset slot={slot_num}, "
                        f"diff={diff:.2f}g"
                    )
                confirm_count = 0

        else:
            now_ts = time.time()
            if now_ts - last_read_warn_at >= 5:
                print(f"[WARN] current stable weight failed slot={slot_num}")
                last_read_warn_at = now_ts
            confirm_count = 0

        stop_event.wait(1)

    if stop_event.is_set():
        print(f"[INFO] weight monitor aborted by shutdown slot={slot_num}")
        return False

    print(
        f"[INFO] taking not confirmed by weight "
        f"slot={slot_num}, threshold={taken_weight_drop_gram:.2f}g"
    )

    return False


def handle_schedule(hw: Hardware, senior: SeniorInfo, schedule: MedicineSchedule):
    """
    복약 스케줄 한 건 처리.

    흐름:
    1. 오늘 TB_SCHEDULE 기록 생성/확인
    2. 문 열리기 전 baseline 무게 측정
    3. 지정 시간에 LED/부저/LCD 알림
    4. 30분 동안 리드/마이크로 스위치로 문 열림 대기
    5. 문 열림 즉시 로드셀로 무게 감소 확인
    6. 문 닫힘 여부와 관계없이 복약 확인 시 TB_SCHEDULE.TAKING_YN='Y'
    7. 실패 시 TB_ALERT + SMS + MISSED 로그
    """
    # DB 기록 순서:
    # 1) ensure_today_schedule()로 오늘 TB_SCHEDULE 행을 만든다/동기화한다.
    # 2) 알림이 시작되면 TB_PILLBOX_LOG에 ALARM을 남긴다.
    # 3) 문이 열리면 monitor_weight_after_open()에서 OPEN을 남긴다.
    # 4) 무게 감소가 확인되면 mark_taken()이 TB_SCHEDULE.TAKING_YN='Y',
    #    TAKEN_TIME=NOW()로 업데이트하고 TB_PILLBOX_LOG에 TAKEN을 남긴다.
    # 5) 복약 확인 실패 시 TB_ALERT에 MISSED_MEDICINE, 로그에는 MISSED를 남기고 SMS를 보낸다.
    # 6) 단, Ctrl+C/종료 중이면 미복약 문자/알림을 만들지 않고 빠져나간다.
    sche_cd = ensure_today_schedule(schedule)
    slot_num = schedule.pillbox_order

    print(
        f"[INFO] due schedule "
        f"sche_cd={sche_cd}, time={schedule.taking_time}, slot={slot_num}"
    )

    baseline_weight = hw.read_stable_weight(slot_num, apply_zero_deadband=False)

    if baseline_weight is not None:
        print(f"[INFO] pre-alarm baseline slot={slot_num}, weight={baseline_weight:.2f}g")
    else:
        print(f"[WARN] pre-alarm baseline failed slot={slot_num}")

    if stop_event.is_set():
        print(f"[INFO] schedule handling aborted before alarm slot={slot_num}, sche_cd={sche_cd}")
        return

    hw.alarm_on(schedule)
    insert_pillbox_log(senior.senior_id, slot_num, "ALARM")

    door_wait_deadline = datetime.now() + timedelta(minutes=DOOR_OPEN_WAIT_MIN)
    door_opened = False

    while datetime.now() < door_wait_deadline and not stop_event.is_set():
        if hw.is_door_open_stable(slot_num):
            door_opened = True
            break

        time.sleep(0.2)

    if door_opened:
        taken = monitor_weight_after_open(
            hw=hw,
            senior=senior,
            schedule=schedule,
            sche_cd=sche_cd,
            baseline=baseline_weight,
        )
    else:
        taken = False

    if stop_event.is_set():
        print(
            f"[INFO] schedule handling aborted by shutdown. "
            f"skipping MISSED/SMS/ALERT slot={slot_num}, sche_cd={sche_cd}"
        )
        hw.alarm_off_slot(slot_num)
        hw.lcd_message("Smart Pillbox", datetime.now().strftime("%H:%M"))
        return

    if not taken:
        hw.alarm_off_slot(slot_num)
        hw.lcd_message("Missed dose", f"Slot {slot_num}")

        msg = (
            f"[복약안심서비스] {senior.senior_name}님 "
            f"{schedule.taking_type} {schedule.taking_time[:5]} 복약이 확인되지 않았습니다."
        )

        insert_alert(senior, "MISSED_MEDICINE", msg, sche_cd)
        send_missed_sms(senior, schedule)
        insert_pillbox_log(senior.senior_id, slot_num, "MISSED")

        time.sleep(2)

    hw.lcd_message("Smart Pillbox", datetime.now().strftime("%H:%M"))


def schedule_loop(hw: Hardware):
    senior = get_pillbox_senior()

    processed: set[Tuple[date, int]] = set()
    running_threads: Dict[Tuple[date, int], threading.Thread] = {}

    current_day = date.today()
    empty_check_count = 0

    while not stop_event.is_set():
        try:
            today = date.today()

            # 날짜가 바뀌면 처리 기록 초기화
            if today != current_day:
                processed.clear()
                running_threads.clear()
                current_day = today

            schedules = fetch_due_schedules(senior.senior_id)

            debug_log(
                f"[DEBUG] schedule check senior={senior.senior_id}, "
                f"found={len(schedules)}, "
                f"pi_now={datetime.now().strftime('%H:%M:%S')}"
            )

            if len(schedules) == 0:
                empty_check_count += 1

                if SCHEDULE_DEBUG_EVERY_N_EMPTY > 0 and empty_check_count % SCHEDULE_DEBUG_EVERY_N_EMPTY == 0:
                    print_schedule_debug(senior.senior_id)
            else:
                empty_check_count = 0

            for schedule in schedules:
                key = (today, schedule.medi_sche_cd)

                if key in processed:
                    continue

                processed.add(key)

                thread = threading.Thread(
                    target=handle_schedule,
                    args=(hw, senior, schedule),
                    daemon=True,
                )

                running_threads[key] = thread
                thread.start()

        except Exception as exc:
            print(f"[ERROR] schedule loop failed: {exc}")

        stop_event.wait(SCHEDULE_POLL_INTERVAL_SEC)


def shutdown(signum=None, frame=None):
    print("[INFO] shutting down...")
    stop_event.set()


# =========================================================
# 시연용 정상 복약 테스트 메모
# =========================================================
# 목적:
# - 테스트할 슬롯의 로드셀 위에 약 또는 무게추를 올린다.
# - 복약 시간을 현재 시간 가까이로 맞춘다.
# - 알림이 울리면 해당 슬롯 문을 연다.
# - 문을 닫지 않아도 된다. 문이 열린 상태에서 약 또는 무게추를 빼면 된다.
# - 기준 무게 - 현재 무게가 TAKEN_WEIGHT_DROP_GRAM 이상으로 TAKEN_CONFIRM_COUNT번 연속 확인되면
#   TB_SCHEDULE.TAKING_YN='Y', TAKEN_TIME=NOW(), TB_PILLBOX_LOG='TAKEN' 처리된다.
#
# 기준 무게 주의:
# - DFRobot HX711은 시작 시점의 하중을 영점처럼 잡을 수 있다.
# - 프로그램 시작 전에 물건이 이미 올라가 있으면 기준 무게가 0g 근처로 보일 수 있다.
# - 이 경우 물건을 빼면 현재 무게가 음수처럼 보일 수 있는데, 센서 특성상 가능한 현상이다.
# - 절대 무게가 아니라 "기준 무게 대비 감소량"으로 복약 완료를 판단한다.
# - 문 닫힘 여부는 복약 완료 조건이 아니다.
#
# 현재 시연 DB에서 chae02의 활성 기본 스케줄은 보통 MEDI_SCHE_CD 37~40이다.
# 정확한 값은 아래 조회로 먼저 확인한다.
#
# SELECT
#     MEDI_SCHE_CD,
#     SENIOR_ID,
#     PILLBOX_ORDER,
#     TAKING_TYPE,
#     TAKING_TIME,
#     USE_YN,
#     START_DATE,
#     END_DATE
# FROM TB_MEDICINE_SCHEDULE
# WHERE SENIOR_ID = 'chae02'
# ORDER BY MEDI_SCHE_CD;
#
# 1번 슬롯을 빠르게 테스트하는 예시:
# - 아래 예시는 MEDI_SCHE_CD=37이 1번 슬롯 기본 스케줄일 때 사용한다.
# - 다른 슬롯을 테스트하려면 MEDI_SCHE_CD와 PILLBOX_ORDER, 로그 삭제 SLOT_NUM을 같이 바꾼다.
#
# UPDATE TB_MEDICINE_SCHEDULE
# SET TAKING_TIME = ADDTIME(CURTIME(), '00:00:40'),
#     USE_YN = 'Y',
#     START_DATE = CURDATE(),
#     END_DATE = NULL,
#     PILLBOX_ORDER = 1
# WHERE MEDI_SCHE_CD = 37
#   AND SENIOR_ID = 'chae02';
#
# INSERT INTO TB_SCHEDULE
# (
#     MEDI_SCHE_CD,
#     SENIOR_ID,
#     TAKING_DATE,
#     PILLBOX_ORDER,
#     TAKING_TYPE,
#     TAKING_TIME,
#     TAKEN_TIME,
#     TAKING_YN,
#     CREATED_AT
# )
# SELECT
#     MEDI_SCHE_CD,
#     SENIOR_ID,
#     CURDATE(),
#     PILLBOX_ORDER,
#     TAKING_TYPE,
#     TAKING_TIME,
#     NULL,
#     'N',
#     NOW()
# FROM TB_MEDICINE_SCHEDULE
# WHERE MEDI_SCHE_CD = 37
#   AND SENIOR_ID = 'chae02'
#   AND NOT EXISTS (
#       SELECT 1
#       FROM TB_SCHEDULE
#       WHERE MEDI_SCHE_CD = 37
#         AND SENIOR_ID = 'chae02'
#         AND TAKING_DATE = CURDATE()
#   );
#
# UPDATE TB_SCHEDULE
# SET PILLBOX_ORDER = 1,
#     TAKING_TYPE = (
#         SELECT TAKING_TYPE
#         FROM TB_MEDICINE_SCHEDULE
#         WHERE MEDI_SCHE_CD = 37
#           AND SENIOR_ID = 'chae02'
#     ),
#     TAKING_TIME = (
#         SELECT TAKING_TIME
#         FROM TB_MEDICINE_SCHEDULE
#         WHERE MEDI_SCHE_CD = 37
#           AND SENIOR_ID = 'chae02'
#     ),
#     TAKEN_TIME = NULL,
#     TAKING_YN = 'N'
# WHERE MEDI_SCHE_CD = 37
#   AND SENIOR_ID = 'chae02'
#   AND TAKING_DATE = CURDATE();
#
# DELETE FROM TB_ALERT
# WHERE SENIOR_ID = 'chae02'
#   AND ALERT_TYPE = 'MISSED_MEDICINE';
#
# DELETE FROM TB_PILLBOX_LOG
# WHERE SENIOR_ID = 'chae02'
#   AND DATE(LOGGED_AT) = CURDATE()
#   AND SLOT_NUM = 1;
#
# 확인용 SQL:
# SELECT
#     NOW() AS DB_NOW,
#     SCHE_CD,
#     MEDI_SCHE_CD,
#     SENIOR_ID,
#     TAKING_DATE,
#     PILLBOX_ORDER,
#     TAKING_TIME,
#     TAKEN_TIME,
#     TAKING_YN
# FROM TB_SCHEDULE
# WHERE MEDI_SCHE_CD = 37
#   AND SENIOR_ID = 'chae02'
#   AND TAKING_DATE = CURDATE();
#
# 시연용 빠른 실행 예:
# SCHEDULE_POLL_INTERVAL_SEC=1 \
# SCHEDULE_EARLY_SEC=300 \
# SCHEDULE_LOOKBACK_SEC=300 \
# WS2812_BRIGHTNESS=128 \
# /home/pi/run_pillbox_ws2812.sh


def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    hw = Hardware()

    try:
        print(f"[INFO] code_version={CODE_VERSION}")
        hw.setup()

        senior = get_pillbox_senior()
        print(f"[INFO] pillbox={PILLBOX_NUM}, senior={senior.senior_id}")
        validate_sms_config(log=True)

        try:
            upsert_power_status("Y")
        except Exception as exc:
            print(f"[WARN] initial power status update failed: {exc}")

        heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
        heartbeat_thread.start()

        hw.lcd_message("YAKSOK", "Ready!")

        schedule_loop(hw)

    finally:
        set_power_off()
        hw.cleanup()


if __name__ == "__main__":
    main()
