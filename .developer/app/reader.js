async function main() {
  const response = await fetch("./data/apology.json");
  const data = await response.json();
  renderNav(data.sections);
  renderText(data.sections);
  bindWords(data);
}

function renderNav(sections) {
  const nav = document.getElementById("sectionNav");
  nav.innerHTML = sections
    .map((section) => `<a href="#section-${section.section}">${section.section}</a>`)
    .join("");
}

function renderText(sections) {
  const text = document.getElementById("text");
  text.innerHTML = sections
    .map(
      (section) => `
        <section class="section" id="section-${section.section}">
          <h2>Section ${section.section}</h2>
          <p>${section.html}</p>
        </section>
      `,
    )
    .join("");
}

function bindWords(data) {
  document.querySelectorAll(".word").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".word.active").forEach((el) => el.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

main().catch((error) => {
  document.getElementById("text").textContent = `Failed to load local data: ${error.message}`;
});
