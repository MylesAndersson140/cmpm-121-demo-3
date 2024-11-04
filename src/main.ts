import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
    <button id="alertButton">Click me!</button>
`;

const button = document.querySelector<HTMLButtonElement>("#alertButton")!;
button.addEventListener("click", (): void => {
  alert("You clicked the button!");
});
