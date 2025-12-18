// Accessibility helpers
export function setHighContrast(enabled: boolean) {
  document.body.classList.toggle('high-contrast', enabled);
}

export function setFontSize(size: number) {
  document.documentElement.style.fontSize = `${size}px`;
}
