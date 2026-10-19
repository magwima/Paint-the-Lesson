// Downloads: PowerPoint (for Canva), Word, PDF and certificates.
import { LIBS, loadScript, plain, mixHex, bodyPt, FONTS, parse, NOTES, KEYRX, saveBlob, safeName, fmtDate } from "./core.js";

function bodyRuns(text, acc){
  const out = [], lines = String(text || "").split("\n").map(l => l.trim()).filter(Boolean);
  lines.forEach((l, li) => {
    let m, para = {}, content = l;
    if ((m = l.match(/^[-*•]\s+(.*)/))) { para = { bullet:{ indent:18 } }; content = m[1]; }
    else if ((m = l.match(/^(\d+)[.)]\s+(.*)/))) { content = m[1] + ". " + m[2]; }
    const segs = content.split(/(\*\*[^*]+\*\*|==[^=]+==|https:\/\/\S+)/).filter(x => x !== "");
    if (!segs.length) segs.push(" ");
    segs.forEach((sg, si) => {
      const o = {}; let t = sg;
      if (/^\*\*[^*]+\*\*$/.test(sg)) { t = sg.slice(2,-2).replace(/==/g,""); o.bold = true; }
      else if (/^==[^=]+==$/.test(sg)) { t = sg.slice(2,-2); o.bold = true; if (acc) o.color = acc; }
      else if (/^https:\/\//.test(sg)) { o.hyperlink = { url:sg }; }
      else t = sg.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2");
      if (si === 0) Object.assign(o, para);
      if (si === segs.length - 1 && li < lines.length - 1) o.breakLine = true;
      out.push({ text:t, options:o });
    });
  });
  return out.length ? out : [{ text:" " }];
}
function splitCols(text){
  const lines = String(text || "").split("\n").filter(l => l.trim()); const h = Math.ceil(lines.length / 2);
  return [lines.slice(0,h).join("\n"), lines.slice(h).join("\n")];
}
export async function buildPptx(cls, opt){
  await loadScript(LIBS.pptx);
  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; pptx.title = cls.title; pptx.author = "Paint the Lesson";
  const d = cls.deck, c = d.colors, f = FONTS[d.font] || FONTS.classic, H = x => String(x).replace("#","").toUpperCase();
  const sc = d.scale || 1, muted = mixHex(c.text, c.bg, .45);
  const slides = d.slides.filter(s => opt.answers || !s.answers);
  slides.forEach((s, i) => {
    const sl = pptx.addSlide(), acc = s.accent || c.accent;
    if (s.kind === "title") {
      sl.background = { color:H(c.primary) };
      if (s.label) sl.addText(plain(s.label), { x:0.9, y:1.6, w:11.5, h:0.45, fontFace:f.body, fontSize:16, color:H(acc), bold:true });
      sl.addText(plain(s.title), { x:0.9, y:2.1, w:11.5, h:2.0, fontFace:f.head, fontSize:Math.round(44*sc), color:"FFFFFF", bold:true, valign:"top" });
      sl.addShape(pptx.ShapeType.rect, { x:0.9, y:4.3, w:1.6, h:0.05, fill:{ color:H(acc) }, line:{ color:H(acc), width:0 } });
      if (s.body) sl.addText(plain(s.body), { x:0.9, y:4.6, w:11.0, h:1.6, fontFace:f.body, fontSize:Math.round(20*sc), color:"E9ECF2", valign:"top" });
    } else {
      sl.background = { color:H(c.bg) };
      sl.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.16, h:7.5, fill:{ color:H(c.primary) }, line:{ color:H(c.primary), width:0 } });
      if (s.label) sl.addText(plain(s.label), { x:0.7, y:0.42, w:11.9, h:0.4, fontFace:f.body, fontSize:13, color:H(acc), bold:true });
      sl.addText(plain(s.title), { x:0.7, y:0.82, w:11.9, h:1.05, fontFace:f.head, fontSize:Math.round(32*sc), color:H(c.primary), bold:true, valign:"top" });
      sl.addShape(pptx.ShapeType.rect, { x:0.7, y:1.96, w:1.4, h:0.03, fill:{ color:H(acc) }, line:{ color:H(acc), width:0 } });
      const box = { x:0.7, y:2.25, w:11.9, h:4.45, fontFace:f.body, fontSize:bodyPt(s,d), color:H(c.text), valign:"top", paraSpaceAfter:6 };
      const ac = H(acc);
      if (s.layout === "columns") { const [a,b] = splitCols(s.body); sl.addText(bodyRuns(a, ac), { ...box, w:5.75 }); sl.addText(bodyRuns(b, ac), { ...box, x:6.85, w:5.75 }); }
      else if (s.layout === "statement") sl.addText(bodyRuns(s.body, ac), { ...box, x:1.2, w:10.9, align:"center", valign:"middle" });
      else sl.addText(bodyRuns(s.body, ac), box);
      if (d.footer) {
        sl.addText(plain(cls.title), { x:0.7, y:6.95, w:9.5, h:0.3, fontFace:f.body, fontSize:10, color:H(muted) });
        sl.addText(`${i+1} / ${slides.length}`, { x:10.6, y:6.95, w:2.0, h:0.3, fontFace:f.body, fontSize:10, color:H(muted), align:"right" });
      }
    }
    if (opt.notes && s.notes) sl.addNotes(s.notes.replace(/\*\*/g,""));
  });
  return await pptx.write({ outputType:"blob" });
}

function runsOf(text){
  const out = [];
  String(text).split(/(\*\*[^*]+\*\*|==[^=\n]+==|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/).forEach(sg => {
    if (!sg) return;
    if (/^\*\*[^*]+\*\*$/.test(sg)) out.push({ t:sg.slice(2,-2).replace(/==/g,""), b:true });
    else if (/^==[^=]+==$/.test(sg)) out.push({ t:sg.slice(2,-2), b:true, m:true });
    else if (/^https?:\/\//.test(sg)) out.push({ t:sg, link:sg });
    else if (/^\*[^*\s][^*]*\*$/.test(sg)) out.push({ t:sg.slice(1,-1), i:true });
    else out.push({ t:sg });
  });
  return out.length ? out : [{ t:"" }];
}
export function docModel(md, student){
  const p = parse(md);
  const tl = p.title.split("\n").map(l => l.trim()).filter(Boolean);
  const head = tl.find(l => /^#\s/.test(l));
  const model = { title: head ? plain(head) : "Lesson", aim: tl.filter(l => !/^#\s/.test(l)).join(" "), sections: [] };
  p.parts.forEach(part => {
    if (student && part.sec === NOTES) return;
    const lines = part.md.split("\n");
    const sec = { name: plain(lines[0].replace(/^##\s+/,"")), paint: part.sec ? part.sec.paint : "#D9D5CC", blocks: [] };
    let target = sec.blocks, list = null;
    lines.slice(1).forEach(raw => {
      const l = raw.replace(/\s+$/,""); let m;
      if ((m = l.match(/^#{3,6}\s+(.*)/))) {
        list = null;
        if (KEYRX.test(m[1])) {
          if (student) { target = null; return; }
          const k = { type:"key", title:plain(m[1]), blocks:[] }; sec.blocks.push(k); target = k.blocks;
        } else { target = sec.blocks; target.push({ type:"h3", runs:runsOf(m[1]) }); }
        return;
      }
      if (!target) return;
      if (!l.trim() || /^-{3,}$/.test(l.trim())) { list = null; return; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (!list || list.type !== "ul") { list = { type:"ul", items:[] }; target.push(list); } list.items.push(runsOf(m[1])); return; }
      if ((m = l.match(/^\s*(\d+)[.)]\s+(.*)/))) { if (!list || list.type !== "ol") { list = { type:"ol", start:+m[1], items:[] }; target.push(list); } list.items.push(runsOf(m[2])); return; }
      list = null; target.push({ type:"p", runs:runsOf(l.trim()) });
    });
    model.sections.push(sec);
  });
  return model;
}

export async function buildDocx(model, student){
  await loadScript(LIBS.docx);
  const D = window.docx, NAVY = "1F2A44", MUTED = "6A675F";
  const tr = (r, base = {}) => r.link
    ? new D.ExternalHyperlink({ link:r.link, children:[new D.TextRun({ text:r.t, color:NAVY, underline:{} })] })
    : new D.TextRun({ text:r.t, bold:!!(r.b || base.bold), italics:!!r.i,
        ...(r.m ? { shading:{ type:D.ShadingType.CLEAR, color:"auto", fill:"F6D3D9" } } : {}) });
  const paras = (blocks, opts = {}) => {
    const { keyColor, ...extra } = opts;
    const out = [];
    blocks.forEach(b => {
      if (b.type === "p") out.push(new D.Paragraph({ children:b.runs.map(r => tr(r)), spacing:{ after:100 }, ...extra }));
      else if (b.type === "h3") out.push(new D.Paragraph({ children:b.runs.map(r => tr(r, { bold:true })), spacing:{ before:160, after:80 }, keepNext:true, ...extra }));
      else if (b.type === "ul") b.items.forEach(it => out.push(new D.Paragraph({ children:it.map(r => tr(r)), bullet:{ level:0 }, spacing:{ after:60 }, ...extra })));
      else if (b.type === "ol") b.items.forEach((it, k) => out.push(new D.Paragraph({
        children:[new D.TextRun({ text:`${b.start + k}.\t` }), ...it.map(r => tr(r))],
        indent:{ left:420, hanging:420 }, tabStops:[{ type:D.TabStopType.LEFT, position:420 }], spacing:{ after:60 }, ...extra })));
      else if (b.type === "key") {
        const kx = { shading:{ type:D.ShadingType.CLEAR, color:"auto", fill:"F4F2EC" },
          border:{ left:{ style:D.BorderStyle.SINGLE, size:18, color:keyColor || "B08D57", space:8 } } };
        out.push(new D.Paragraph({ children:[new D.TextRun({ text:b.title, bold:true })], spacing:{ before:120, after:60 }, keepNext:true, ...kx }));
        out.push(...paras(b.blocks, kx));
      }
    });
    return out;
  };
  const children = [
    new D.Paragraph({ children:[new D.TextRun({ text:model.title, bold:true, size:44, color:NAVY, font:"Georgia" })], spacing:{ after:80 } })
  ];
  if (model.aim) children.push(new D.Paragraph({ children:[new D.TextRun({ text:plain(model.aim), italics:true, color:MUTED })], spacing:{ after:160 } }));
  if (student) children.push(new D.Paragraph({ children:[new D.TextRun({ text:"Name: ________________________     Date: ______________", color:MUTED })], spacing:{ after:200 } }));
  model.sections.forEach(sec => {
    const paint = sec.paint.replace("#","").toUpperCase();
    children.push(new D.Paragraph({
      children:[new D.TextRun({ text:"■  ", color:paint, size:26 }), new D.TextRun({ text:sec.name, bold:true, color:NAVY, size:28, font:"Georgia" })],
      spacing:{ before:360, after:120 }, keepNext:true,
      border:{ top:{ style:D.BorderStyle.SINGLE, size:4, color:"E3DED4", space:10 } } }));
    children.push(...paras(sec.blocks, { keyColor:paint }));
  });
  const doc = new D.Document({
    creator:"Paint the Lesson", title:model.title,
    styles:{ default:{ document:{ run:{ font:"Calibri", size:22, color:"26262A" } } } },
    sections:[{
      properties:{ page:{ margin:{ top:1000, bottom:1000, left:1100, right:1100 } } },
      headers:{ default:new D.Header({ children:[new D.Paragraph({ alignment:D.AlignmentType.RIGHT,
        children:[new D.TextRun({ text:`${model.title}, ${student ? "worksheet" : "teacher copy"}`, size:16, color:MUTED })] })] }) },
      footers:{ default:new D.Footer({ children:[new D.Paragraph({ alignment:D.AlignmentType.CENTER,
        children:[new D.TextRun({ children:[D.PageNumber.CURRENT], size:16, color:MUTED })] })] }) },
      children
    }]
  });
  return await D.Packer.toBlob(doc);
}

async function pdfMake(){ await loadScript(LIBS.pdfmake); await loadScript(LIBS.pdfFonts); return window.pdfMake; }
export async function buildPdf(model, student){
  const pm = await pdfMake();
  const txt = (runs, base = {}) => runs.map(r => ({ text:r.t, bold:!!(r.b || base.bold), italics:!!r.i,
    ...(r.m ? { background:"#F6D3D9" } : {}), ...(r.link ? { link:r.link, color:"#1F2A44", decoration:"underline" } : {}) }));
  const blocks = (bs, paint) => bs.map(b => {
    if (b.type === "p") return { text:txt(b.runs), margin:[0,0,0,6] };
    if (b.type === "h3") return { text:txt(b.runs, { bold:true }), margin:[0,8,0,4] };
    if (b.type === "ul") return { ul:b.items.map(it => ({ text:txt(it) })), margin:[0,0,0,6] };
    if (b.type === "ol") return { ol:b.items.map(it => ({ text:txt(it) })), start:b.start, margin:[0,0,0,6] };
    if (b.type === "key") return {
      table:{ widths:["*"], body:[[{ stack:[{ text:b.title, bold:true, margin:[0,0,0,4] }, ...blocks(b.blocks, paint)], fillColor:"#F4F2EC" }]] },
      layout:{ hLineWidth:() => 0, vLineWidth:i => i === 0 ? 3 : 0, vLineColor:() => paint,
        paddingLeft:() => 12, paddingRight:() => 10, paddingTop:() => 8, paddingBottom:() => 6 },
      margin:[0,4,0,8] };
    return { text:"" };
  });
  const content = [{ text:model.title, style:"title" }];
  if (model.aim) content.push({ text:txt(runsOf(model.aim)), style:"aim" });
  if (student) content.push({ text:"Name: ________________________     Date: ______________", color:"#6A675F", margin:[0,0,0,10] });
  model.sections.forEach(sec => {
    content.push({ canvas:[{ type:"line", x1:0, y1:0, x2:515, y2:0, lineWidth:0.6, lineColor:"#E3DED4" }], margin:[0,12,0,8] });
    content.push({ columns:[{ width:16, canvas:[{ type:"rect", x:0, y:4, w:9, h:9, r:1.5, color:sec.paint }] }, { text:sec.name, style:"h2" }],
      columnGap:2, margin:[0,0,0,6], headlineLevel:1 });
    content.push(...blocks(sec.blocks, sec.paint));
  });
  const dd = {
    pageSize:"A4", pageMargins:[40,56,40,50], info:{ title:model.title, author:"Paint the Lesson" },
    header:cur => cur > 1 ? { text:`${model.title}, ${student ? "worksheet" : "teacher copy"}`, alignment:"right", fontSize:8, color:"#6A675F", margin:[40,26,40,0] } : null,
    footer:(cur, total) => ({ text:`${cur} / ${total}`, alignment:"center", fontSize:8, color:"#6A675F", margin:[0,18,0,0] }),
    pageBreakBefore:(node, after) => node.headlineLevel === 1 && after.length === 0,
    content, defaultStyle:{ font:"Roboto", fontSize:10.5, lineHeight:1.25, color:"#26262A" },
    styles:{ title:{ fontSize:22, bold:true, color:"#1F2A44", margin:[0,0,0,4] }, aim:{ italics:true, color:"#6A675F", margin:[0,0,0,10] }, h2:{ fontSize:14, bold:true, color:"#1F2A44" } }
  };
  return await new Promise((res, rej) => { try { pm.createPdf(dd).getBlob(b => res(b)); } catch(e) { rej(e); } });
}

// Download a painted lesson as Word or PDF
export async function saveDoc(kind, md, student, titleText, msg){
  const model = docModel(md, student);
  const base = safeName(titleText || model.title) + (student ? " - worksheet" : "");
  try {
    msg(kind === "pdf" ? "Building the PDF…" : "Building the Word file…");
    const blob = kind === "pdf" ? await buildPdf(model, student) : await buildDocx(model, student);
    saveBlob(blob, base + (kind === "pdf" ? ".pdf" : ".docx"));
    msg("Downloaded.");
  } catch(e) {
    msg(e && e.message === "load" ? "The document builder couldn't load. Check your connection and try again." : "Something went wrong building the file. Try again.", true);
  }
}

export async function savePptx(cls, opt){
  const blob = await buildPptx(cls, opt);
  saveBlob(blob, safeName(cls.title) + ".pptx");
}

// Certificate of completion, A4 landscape
export async function certificatePdf(cert, verifyUrl){
  const pm = await pdfMake();
  const W = 842, H = 595, paints = ["#E89AA6","#F2B33D","#B9D8B0","#A9CFEA","#C9B6E4"];
  const dd = {
    pageSize:"A4", pageOrientation:"landscape", pageMargins:[60,60,60,50], info:{ title:"Certificate: " + cert.course_title, author:"Paint the Lesson" },
    background: () => ({ canvas:[
      { type:"rect", x:0, y:0, w:W, h:H, color:"#FCFBF8" },
      { type:"rect", x:24, y:24, w:W-48, h:H-48, lineWidth:1.2, lineColor:"#1F2A44" },
      { type:"rect", x:30, y:30, w:W-60, h:H-60, lineWidth:0.5, lineColor:"#B08D57" },
      ...paints.map((c,i) => ({ type:"ellipse", x:W/2 - 72 + i*36, y:96, r1:11, r2:10, color:c }))
    ]}),
    content:[
      { text:"Paint the Lesson", alignment:"center", fontSize:11, bold:true, color:"#6A675F", margin:[0,52,0,18], characterSpacing:2 },
      { text:"Certificate of completion", alignment:"center", fontSize:30, bold:true, color:"#1F2A44", margin:[0,0,0,22] },
      { text:"This certifies that", alignment:"center", fontSize:12, color:"#6A675F" },
      { text:cert.student_name, alignment:"center", fontSize:34, bold:true, color:"#26262A", margin:[0,8,0,8] },
      { canvas:[{ type:"line", x1:230, y1:0, x2:492, y2:0, lineWidth:1, lineColor:"#B08D57" }], margin:[0,0,0,12] },
      { text:"has completed the course", alignment:"center", fontSize:12, color:"#6A675F" },
      { text:cert.course_title, alignment:"center", fontSize:22, bold:true, color:"#1F2A44", margin:[0,6,0,28] },
      { columns:[
        { stack:[{ text:cert.teacher_name || " ", bold:true, fontSize:12 }, { text:"Teacher", fontSize:9, color:"#6A675F" }], alignment:"center" },
        { stack:[{ text:fmtDate(cert.issued_at, { day:"numeric", month:"long", year:"numeric" }), bold:true, fontSize:12 }, { text:"Date", fontSize:9, color:"#6A675F" }], alignment:"center" }
      ]},
      { text:[ "Certificate number ", { text:cert.id, bold:true }, "\nCheck it at ", { text:verifyUrl, link:verifyUrl, color:"#1F2A44", decoration:"underline" } ],
        alignment:"center", fontSize:8, color:"#6A675F", margin:[0,30,0,0] }
    ],
    defaultStyle:{ font:"Roboto" }
  };
  const blob = await new Promise((res, rej) => { try { pm.createPdf(dd).getBlob(b => res(b)); } catch(e) { rej(e); } });
  saveBlob(blob, "Certificate - " + safeName(cert.course_title) + ".pdf");
}
