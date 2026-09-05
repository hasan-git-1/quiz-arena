export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "join-mobile.png", fullPage: true });
  return await page.evaluate(() => {
    const card = document.querySelector(".join-card")?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageWidth: document.documentElement.scrollWidth,
      card: card && { x: card.x, width: card.width, bottom: card.bottom },
      inputFocused: document.activeElement?.id,
      buttonDisabled: document.querySelector(".cta-button")?.hasAttribute("disabled")
    };
  });
}
