#!/usr/bin/env bash
set -euo pipefail

# WS2812/rpi_ws281x는 /dev/mem 접근이 필요하므로 sudo로 실행한다.
# PYTHONPATH는 sudo 실행 시 pi 사용자에 설치된 패키지를 찾기 위한 경로다.
exec sudo -E env \
  PYTHONPATH="/home/pi/.local/lib/python3.11/site-packages:${PYTHONPATH:-}" \
  LED_TYPE="${LED_TYPE:-ws2812}" \
  WS2812_ENABLE="${WS2812_ENABLE:-1}" \
  WS2812_PIN="${WS2812_PIN:-12}" \
  WS2812_LED_COUNT="${WS2812_LED_COUNT:-8}" \
  WS2812_BRIGHTNESS="${WS2812_BRIGHTNESS:-32}" \
  PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}" \
  python3 /home/pi/zinzzajabal.py
