// Get the theme toggle button from the current page.
const themeToggle = document.querySelector("#theme-toggle");

// This function loads the saved theme when the page opens.
function loadTheme() {
  const savedTheme = localStorage.getItem("website_theme");

  if (savedTheme === "dark-theme") {
    document.body.classList.add("dark-theme");
    themeToggle.textContent = "Light Theme";
  } else {
    document.body.classList.remove("dark-theme");
    themeToggle.textContent = "Dark Theme";
  }
}

// This function switches between the default theme and dark theme.
function toggleTheme() {
  document.body.classList.toggle("dark-theme");

  if (document.body.classList.contains("dark-theme")) {
    localStorage.setItem("website_theme", "dark-theme");
    themeToggle.textContent = "Light Theme";
  } else {
    localStorage.setItem("website_theme", "default");
    themeToggle.textContent = "Dark Theme";
  }
}

// Run the theme loader only if the button exists on the page.
if (themeToggle) {
  loadTheme();
  themeToggle.addEventListener("click", toggleTheme);
}

// Keep the theme updated if it changes in another browser tab.
window.addEventListener("storage", loadTheme);
