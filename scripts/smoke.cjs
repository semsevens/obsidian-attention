// Load the built plugin with a stubbed `obsidian` and run its lifecycle,
// so a throw during onload (which Obsidian swallows into a dead plugin)
// shows up as a stack trace here.
const Module = require('module');
const path = require('path');
const TARGET = path.resolve(process.cwd(), process.argv[2] || 'main.js');

class Component {
  registerEvent() {} register() {} registerDomEvent() {} registerInterval() {}
  addChild(c) { return c; }
}
class Events { on() { return {}; } off() {} trigger() {} }
class View extends Component {
  // Real Obsidian sets `app` on the view; the stub must too.
  constructor(leaf) { super(); this.leaf = leaf; this.app = global.__APP; this.containerEl = el(); this.contentEl = el(); }
}
class ItemView extends View {}
class TFile { constructor(p) { this.path = p; this.basename = (p||'').split('/').pop(); this.extension='md'; } }
class TAbstractFile {}
class Notice { constructor(m) { console.log('   [Notice]', m); } }
class Modal extends Component { constructor(app){super(); this.app=app; this.contentEl=el();} open(){} close(){} }
class MarkdownView extends View {}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = el(); } }
class Setting {
  constructor(c) { this.c = c; }
  setName() { return this; } setDesc() { return this; } setHeading() { return this; }
  addText(f) { f(stubInput()); return this; }
  addToggle(f) { f(stubInput()); return this; }
  addSlider(f) { f(stubSlider()); return this; }
  addDropdown(f) { f(stubDropdown()); return this; }
  addButton(f) { f(stubButton()); return this; }
}
const stubInput = () => ({ setValue(){return this}, setPlaceholder(){return this}, onChange(){return this} });
const stubSlider = () => ({ setLimits(){return this}, setValue(){return this}, setDynamicTooltip(){return this}, onChange(){return this} });
const stubDropdown = () => ({ addOption(){return this}, setValue(){return this}, onChange(){return this} });
const stubButton = () => ({ setButtonText(){return this}, setCta(){return this}, onClick(){return this} });
class Menu { addItem(){return this} showAtMouseEvent(){} }
class Plugin extends Component {
  constructor(app, manifest) { super(); this.app = app; this.manifest = manifest; }
  addRibbonIcon(icon, title, cb) { RIBBON.push({ icon, title, cb }); return el(); }
  addCommand(c) { COMMANDS.push(c); return c; }
  addSettingTab() {}
  registerView(type, factory) { VIEWS[type] = factory; }
  registerEditorExtension() {}
  registerMarkdownPostProcessor() {}
  async loadData() { return null; }
  async saveData() {}
}
const RIBBON = [], COMMANDS = [], VIEWS = {};

// Minimal DOM-ish element with the helpers Obsidian patches onto HTMLElement.
function el() {
  const e = {
    children: [], classes: new Set(), style: { setProperty(){} }, dataset: {},
    empty() { this.children = []; return this; },
    createDiv(cls) { const c = el(); c.cls = cls; this.children.push(c); return c; },
    createEl(tag, o) { const c = el(); c.tag = tag; Object.assign(c, o); this.children.push(c); return c; },
    createSpan(cls) { const c = el(); c.cls = cls; this.children.push(c); return c; },
    setText(t) { this.text = t; return this; },
    appendText(t) { this.text = (this.text||'') + t; return this; },
    addClass(c) { this.classes.add(c); return this; },
    removeClass(c) { this.classes.delete(c); return this; },
    toggleClass(c, on) { on ? this.classes.add(c) : this.classes.delete(c); return this; },
    setAttribute(){}, setCssProps(){}, setCssStyles(){},
    addEventListener(){}, removeEventListener(){},
    contains(){ return true; }, querySelector(){ return null; },
    getBoundingClientRect() { return { top:0,left:0,width:0,height:0,bottom:0,right:0 }; },
    appendChild(c){ this.children.push(c); return c; }, detach(){}, remove(){},
    closest(){ return null; },
  };
  return e;
}
global.document = { body: el(), createElement: () => el(), createTreeWalker: () => ({ nextNode: () => null }),
                    addEventListener(){}, removeEventListener(){} };
global.window = { setTimeout: setTimeout, getSelection: () => null, innerWidth: 1200, innerHeight: 800 };

const obsidian = { Component, Events, View, ItemView, TFile, TAbstractFile, Notice, Modal, MarkdownView,
                   PluginSettingTab, Setting, Menu, Plugin,
                   editorInfoField: {}, editorLivePreviewField: {}, editorViewField: {} };

const orig = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'obsidian') return obsidian;
  if (req.startsWith('@codemirror/') || req.startsWith('@lezer/')) {
    return new Proxy({}, { get: () => new Proxy(function(){}, { get: () => () => ({}), apply: () => ({}) }) });
  }
  return orig.call(this, req, ...rest);
};

const workspace = Object.assign(new Events(), {
  onLayoutReady(cb) { LAYOUT_READY = cb; },
  getLeavesOfType() { return LEAVES; },
  getRightLeaf() { return makeLeaf(); },
  getActiveViewOfType() { return null; },
  getActiveFile() { return ACTIVE_FILE; },
  revealLeaf: async () => {}, setActiveLeaf() {}, getLeaf() { return {}; },
});
let LAYOUT_READY = null;
const LEAVES = [];
function makeLeaf() {
  const leaf = {
    view: null,
    detach() { const i = LEAVES.indexOf(leaf); if (i >= 0) LEAVES.splice(i, 1); },
    async setViewState(st) {
      const f = VIEWS[st.type];
      if (f) { leaf.view = f(leaf); await leaf.view.onOpen?.(); }
    },
  };
  LEAVES.push(leaf);
  return leaf;
}
let ACTIVE_FILE = null;

const FILES = new Map();
const app = {
  workspace,
  vault: Object.assign(new Events(), {
    getFiles: () => [...FILES.keys()].map(p => new TFile(p)),
    getAbstractFileByPath: (p) => FILES.has(p) ? new TFile(p) : null,
    read: async (f) => FILES.get(f.path) ?? '', cachedRead: async (f) => FILES.get(f.path) ?? '',
    modify: async () => {}, create: async () => {},
  }),
  fileManager: { trashFile: async () => {}, renameFile: async () => {} },
};

global.__APP = app;

(async () => {
  const loaded = require(TARGET);
  const PluginClass = loaded.default ?? loaded;
  const p = new PluginClass(app, { id: 'attention', version: '0.1.0' });
  console.log('▶ onload()...');
  await p.onload();
  console.log('✅ onload 完成，没有抛错');
  console.log('   ribbon 图标:', RIBBON.map(r => `${r.icon}/"${r.title}"`).join(', ') || '(无)');
  console.log('   命令:', COMMANDS.map(c => c.id).join(', ') || '(无)');
  console.log('   注册的视图类型:', Object.keys(VIEWS).join(', ') || '(无)');

  if (LAYOUT_READY) { console.log('▶ onLayoutReady()...'); await LAYOUT_READY(); console.log('✅ 没有抛错'); }

  const factory = VIEWS['attention-review'];
  if (!factory) { console.log('❌ attention-review 视图没注册'); return; }
  // Now the interesting case: a note that actually has annotations.
  const NOTE = '_test/attention/plain-note.md';
  FILES.set(NOTE, '# 普通笔记\n\n注意力是稀缺资源。');
  FILES.set(NOTE + '.anno.json', JSON.stringify({ version:1, target:NOTE, annotations:[
    { id:'a1', anchor:{kind:'markdown',quote:'注意力是稀缺资源。',prefix:'',suffix:'',from:10,to:19},
      color:'#f5c542', body:null, created:new Date().toISOString(), reviewed:[] },
    { id:'a2', anchor:{kind:'markdown',quote:'普通笔记',prefix:'# ',suffix:'',from:2,to:6},
      color:'#7ec96b', body:'这是一条评论', created:new Date().toISOString(), reviewed:[] },
  ]}));
  ACTIVE_FILE = new TFile(NOTE);

  console.log('▶ 构造 ReviewView 并 onOpen()...');
  const view = factory({ view: null });
  await view.onOpen();
  console.log('✅ onOpen 完成');
  console.log('   getViewType():', view.getViewType());
  console.log('   getIcon():', view.getIcon());
  const dump = (n, d=0) => { if(d>3) return;
    for (const c of n.children) { console.log('     '+'  '.repeat(d) + (c.cls||c.tag||'?') + (c.text?` — "${c.text}"`:'')); dump(c, d+1); } };
  console.log('   渲染出的 DOM:');
  dump(view.contentEl);

  console.log('▶ ribbon 点击...');
  await RIBBON[0]?.cb();
  console.log('✅ 没有抛错');
})().catch(e => { console.error('❌ 抛错了:\n', e); process.exit(1); });
