function setupPrint() {
  const printButton = document.createElement('button');
  printButton.id = 'printBtn';
  printButton.textContent = 'Print';
  printButton.style.position = 'fixed';
  printButton.style.top = '10px';
  printButton.style.right = '10px';
  printButton.style.zIndex = '1001';
  printButton.style.padding = '4px 8px';
  printButton.style.fontSize = '12px';
  document.body.appendChild(printButton);

  printButton.addEventListener('click', () => {
    window.print();
  });
}
