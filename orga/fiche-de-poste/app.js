(() => {
  const sheet = document.getElementById("sheet");

  // preview fields (p_)
  const p = (id) => document.getElementById(id);

  // form fields (f_)
  const f = (id) => document.getElementById(id);

  function setText(el, value) {
    el.textContent = value ?? "";
  }

  function setBullets(container, linesText) {
    const lines = String(linesText || "")
      .replace(/\r/g, "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    container.innerHTML = "";
    if (!lines.length) return;

    for (const line of lines) {
      const div = document.createElement("div");
      div.className = "bullet";
      div.textContent = line;
      container.appendChild(div);
    }
  }

  function apply() {
    setText(p("p_commune"), f("f_commune").value);
    setText(p("p_date"), f("f_date").value);
    setText(p("p_intitule"), f("f_intitule").value);

    setText(p("p_nom"), f("f_nom").value);
    setText(p("p_prenom"), f("f_prenom").value);
    setText(p("p_naissance"), f("f_naissance").value);
    setText(p("p_entree_collectivite"), f("f_entree_collectivite").value);
    setText(p("p_entree_fonction"), f("f_entree_fonction").value);
    setText(p("p_qualite"), f("f_qualite").value);
    setText(p("p_cadre"), f("f_cadre").value);
    setText(p("p_grade"), f("f_grade").value);
    setText(p("p_temps"), f("f_temps").value);
    setText(p("p_service"), f("f_service").value);
    setText(p("p_superieur"), f("f_superieur").value);

    setText(p("p_objet"), f("f_objet").value);

    setBullets(p("p_missions_principales"), f("f_missions_principales").value);
    setBullets(p("p_missions_complementaires"), f("f_missions_complementaires").value);

    setText(p("p_collab_interne"), f("f_collab_interne").value);
    setText(p("p_collab_externe"), f("f_collab_externe").value);

    setText(p("p_moyens"), f("f_moyens").value);

    setText(p("p_spec_contexte"), f("f_spec_contexte").value);
    setText(p("p_spec_physiques"), f("f_spec_physiques").value);

    setText(p("p_comp_tech"), f("f_comp_tech").value);
    setBullets(p("p_comp_rel"), f("f_comp_rel").value);

    fitToScreen();
  }

  // SCALE pour ne jamais dépasser la largeur visible
  function fitToScreen() {
    const shell = sheet.parentElement; // sheet-shell
    if (!shell) return;

    const available = Math.min(document.documentElement.clientWidth - 20, shell.clientWidth || window.innerWidth);
    const w = 1123; // A4 paysage width
    const scale = Math.min(1, (available / w));

    sheet.style.transform = `scale(${scale})`;
    sheet.style.marginBottom = scale < 1 ? `${(1 - scale) * 300}px` : "0px";
  }

  // Export PDF A4 paysage fidèle
  async function exportPDF() {
    // On exporte le "sheet" seul (pas le formulaire)
    const canvas = await html2canvas(sheet, { backgroundColor: "#ffffff", scale: 2 });
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;

    pdf.addImage(imgData, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
    pdf.save("fiche_de_poste.pdf");
  }

  function printSheet() {
    const win = window.open("", "_blank");
    const cssHref = "style.css";

    win.document.write(`
      <html><head>
        <meta charset="utf-8"/>
        <title>Impression</title>
        <link rel="stylesheet" href="${cssHref}">
        <style>
          body{ background:#fff; padding:0; margin:0; }
          .top-actions,.editor-zone{ display:none !important; }
          .sheet-shell{ justify-content:center; }
          .sheet{ transform: none !important; box-shadow:none !important; }
        </style>
      </head><body>
        <div class="sheet-shell">${sheet.outerHTML}</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  document.getElementById("btnApply").addEventListener("click", apply);
  document.getElementById("btnPdf").addEventListener("click", exportPDF);
  document.getElementById("btnPrint").addEventListener("click", printSheet);

  // live update (option)
  const allInputs = document.querySelectorAll("input, textarea");
  allInputs.forEach(el => el.addEventListener("input", () => apply()));

  window.addEventListener("resize", fitToScreen);

  apply();
})();
