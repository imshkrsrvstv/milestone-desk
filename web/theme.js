/* Run before styles: system first, with an explicit per-device preference. */
(() => {
  const key = "milestone-appearance";
  const media = matchMedia("(prefers-color-scheme: dark)");
  let choice;
  try {
    choice = localStorage.getItem(key);
  } catch {}
  const valid = (value) => value === "dark" || value === "light";
  if (!valid(choice)) choice = null;
  function apply() {
    const theme = choice || (media.matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#101827" : "#edf1f7");
    dispatchEvent(
      new CustomEvent("milestone-theme", {
        detail: { theme, system: !choice },
      }),
    );
  }
  window.MilestoneTheme = {
    get: () => document.documentElement.dataset.theme,
    system: () => !choice,
    set(value) {
      choice = valid(value) ? value : null;
      try {
        choice
          ? localStorage.setItem(key, choice)
          : localStorage.removeItem(key);
      } catch {}
      apply();
    },
    toggle() {
      this.set(this.get() === "dark" ? "light" : "dark");
    },
  };
  media.addEventListener("change", () => {
    if (!choice) apply();
  });
  addEventListener("storage", (event) => {
    if (event.key === key) {
      choice = valid(event.newValue) ? event.newValue : null;
      apply();
    }
  });
  apply();
})();
