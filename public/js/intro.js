const menuButtons = document.querySelectorAll(".menu-button");
const panels = document.querySelectorAll(".panel");
const emptyDashboard = document.querySelector("#emptyDashboard");
const readyDashboard = document.querySelector("#readyDashboard");
const registerInput = document.querySelector("#medicineBoxNumber");
const registerButton = document.querySelector("#registerButton");
const openRegisterFromIntro = document.querySelector("#openRegisterFromIntro");
const openRegisterFromDashboard = document.querySelector("#openRegisterFromDashboard");
const buyMedicineBox = document.querySelector("#buyMedicineBox");

let hasRegisteredMedicineBox = serverHasMedicineBox;

function showPanel(targetId) {
  menuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.target === targetId);
  });

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

function openRegisterPanel() {
  showPanel("method");
  registerInput.focus();
}

menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.target === "dashboard" && !hasRegisteredMedicineBox) {
      emptyDashboard.hidden = false;
      readyDashboard.hidden = true;
    }

    showPanel(button.dataset.target);
  });
});

openRegisterFromIntro.addEventListener("click", openRegisterPanel);
openRegisterFromDashboard.addEventListener("click", openRegisterPanel);

registerButton.addEventListener("click", () => {
  const medicineBoxNumber = registerInput.value.trim();

  if (!medicineBoxNumber) {
    alert("약통 번호를 입력해주세요!");
    registerInput.focus();
    return;
  }

  hasRegisteredMedicineBox = true;
  emptyDashboard.hidden = true;
  readyDashboard.hidden = false;
  showPanel("dashboard");
});

buyMedicineBox.addEventListener("click", () => {
  alert("약통 구매 페이지 주소가 정해지면 이 버튼에 연결하면 됩니다.");
});
