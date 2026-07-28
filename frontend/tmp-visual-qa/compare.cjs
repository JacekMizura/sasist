const fs = require("fs");
const m = JSON.parse(fs.readFileSync("tmp-visual-qa/metrics.json", "utf8"));
const L = m.labels;
const P = m.print;
const LR = m.labelsReady;
const PR = m.printReady;

function line(label, a, b) {
  console.log(`${a === b ? "OK  " : "DIFF"} ${label}: ${a} | ${b}`);
}

console.log("=== LIST ===");
line("headerToTabs", L.rhythm.headerToTabs, P.rhythm.headerToTabs);
line("tabsToToolbar", L.rhythm.tabsToToolbar, P.rhythm.tabsToToolbar);
line("tabsToSearch", L.rhythm.tabsToSearch, P.rhythm.tabsToSearch);
line("searchTop", L.searches[0]?.top, P.searches[0]?.top);
line("searchW", L.searches[0]?.width, P.searches[0]?.width);
line("searchH", L.searches[0]?.height, P.searches[0]?.height);
line("Nowy top", L.buttons.find((b) => b.text.includes("Nowy"))?.top, P.buttons.find((b) => b.text.includes("Nowy"))?.top);
line("Nowy h", L.buttons.find((b) => b.text.includes("Nowy"))?.height, P.buttons.find((b) => b.text.includes("Nowy"))?.height);
line("rowTop", L.listRows[0]?.top, P.listRows[0]?.top);
line("rowH", L.listRows[0]?.height, P.listRows[0]?.height);
line("rowPadT", L.listRows[0]?.paddingTop, P.listRows[0]?.paddingTop);
line("rowRadius", L.listRows[0]?.borderRadius, P.listRows[0]?.borderRadius);
line("rowGap", L.listRows[1].top - L.listRows[0].bottom, P.listRows[1].top - P.listRows[0].bottom);
line("innerAsideW", L.asides[1]?.width, P.asides[1]?.width);
line("moduleTitleTop", L.h1s[0].top, P.h1s[0].top);
line("tabsTop", L.tablists[0].top, P.tablists[0].top);
line("toolbarTitleTop", L.h1s[1].top, P.h1s[1].top);

console.log("=== READY ===");
line("headerToTabs", LR.rhythm.headerToTabs, PR.rhythm.headerToTabs);
line("Nowy top", LR.buttons[0]?.top, PR.buttons[0]?.top);
line("filterTabsTop", LR.tablists[1]?.top, PR.tablists[1]?.top);
line("cardTop", LR.articles[0].card.top, PR.articles[0].card.top);
line("cardH", LR.articles[0].card.height, PR.articles[0].card.height);
line("bandH", LR.articles[0].band.height, PR.articles[0].band.height);
line("bodyPad", LR.articles[0].body.paddingTop, PR.articles[0].body.paddingTop);
const le = LR.buttons.find((b) => b.text === "Edytuj");
const pe = PR.buttons.find((b) => b.text === "Edytuj");
line("cardBtnEdytujH", le?.height, pe?.height);
line("cardBtnEdytujW", le?.width, pe?.width);
const lu = LR.buttons.find((b) => b.text === "Użyj");
const pu = PR.buttons.find((b) => b.text === "Użyj");
line("cardBtnUzyjH", lu?.height, pu?.height);
line("cardGap", LR.articles[1].card.left - LR.articles[0].card.right, PR.articles[1].card.left - PR.articles[0].card.right);
