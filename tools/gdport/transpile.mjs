/**
 * CAGE BOSS: TypeScript → GDScript translator for the Godot port (port/godot).
 *
 * The TypeScript in src/ stays the one source of truth. This turns each module into a GDScript
 * class (`M_<path>`) under port/godot/gen/, keeping JavaScript semantics with the help of the
 * runtime in port/godot/rt (JS, JSSet, JSMap): every number is a float, plain objects are
 * Dictionaries, arrays are Arrays, classes are inner classes.
 *
 *   node tools/gdport/transpile.mjs src/core/rng.ts src/sim/*.ts ...
 *
 * Anything it can't translate faithfully is reported with file:line, and the TypeScript is
 * simplified instead (the golden tests prove the two still behave the same).
 */
import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const OUT = process.env.GDPORT_OUT ? path.resolve(process.env.GDPORT_OUT) : path.join(REPO, 'port/godot/gen');

// ------------------------------------------------------------------ program

const cfgPath = path.join(REPO, 'tsconfig.json');
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, REPO);
const extraRoots = process.env.GDPORT_ROOTS ? process.env.GDPORT_ROOTS.split(',').map((f) => path.resolve(REPO, f)) : [];
const program = ts.createProgram([...cfg.fileNames, ...extraRoots], { ...cfg.options, noEmit: true });
const checker = program.getTypeChecker();

const problems = [];
function report(node, msg) {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
  problems.push(`${path.relative(REPO, sf.fileName)}:${line + 1}: ${msg}`);
}

// ------------------------------------------------------------------ names

const RESERVED = new Set(`and as assert await break breakpoint class class_name const continue elif else enum extends for func if in is match namespace not or pass preload return self signal static super trait var void when while yield
PI TAU INF NAN print printt prints printerr push_error push_warning str int float bool len range min max abs absf absi floor ceil round clamp clampf clampi sign signf signi sqrt pow load typeof type_convert char ord hash seed randf randi randomize lerp lerpf wrap wrapf wrapi step snapped fmod fposmod posmod is_nan is_inf is_same exp log sin cos tan asin acos atan atan2 deg_to_rad rad_to_deg instance_from_id is_instance_valid weakref inst_to_dict dict_to_inst convert get_stack print_stack rid_from_int
Color Vector2 Vector2i Vector3 Rect2 Transform2D Array Dictionary String StringName Callable Signal Object Node Node2D RefCounted Resource JSON Time OS Engine Input Image Texture Texture2D Sprite2D RegEx Callable PackedStringArray
JS JSSet JSMap PX`.split(/\s+/));
const OBJECT_MEMBERS = new Set(['get', 'set', 'call', 'callv', 'connect', 'disconnect', 'emit_signal', 'free', 'notification', 'to_string', 'get_class', 'is_class', 'has_method', 'set_meta', 'get_meta', 'has_meta', 'reference', 'unreference', 'init_ref', 'get_script', 'set_script', 'get_property_list', 'is_connected', 'tr', 'get_instance_id', 'duplicate', 'new', 'size', 'is_empty', 'clear', 'delete', 'free', 'erase', 'has']);
const safe = (n) => (n === '_' ? '_u' : /^_+$/.test(n) ? '_u' + n.length : RESERVED.has(n) ? n + '_' : n);
const memberName = (n) => (OBJECT_MEMBERS.has(n) || RESERVED.has(n) ? n + '_' : n);

export function moduleClass(file) {
  const rel = path.relative(path.join(REPO, 'src'), file).replace(/\.ts$/, '');
  if (rel.startsWith('..')) return 'M_' + path.relative(REPO, file).replace(/\.ts$/, '').replace(/[^A-Za-z0-9]+/g, '_');
  return 'M_' + rel.replace(/[^A-Za-z0-9]+/g, '_');
}
function outFile(file) {
  const rel = path.relative(path.join(REPO, 'src'), file);
  const r = rel.startsWith('..') ? path.relative(REPO, file) : rel;
  return path.join(OUT, r.replace(/\.ts$/, '.gd'));
}

// ------------------------------------------------------------------ types

const F = ts.TypeFlags;
function kindOfType(t, depth = 0) {
  if (!t || depth > 6) return 'any';
  if (t.flags & (F.Any | F.Unknown)) return 'any';
  if (t.flags & F.TypeParameter) {
    const c = checker.getBaseConstraintOfType(t);
    return c && c !== t ? kindOfType(c, depth + 1) : 'any';
  }
  if (t.isUnion()) {
    const ks = new Set();
    for (const m of t.types) {
      if (m.flags & (F.Null | F.Undefined | F.Void)) continue;
      ks.add(kindOfType(m, depth + 1));
    }
    if (ks.size === 1) return [...ks][0];
    if (ks.size === 0) return 'null';
    return 'any';
  }
  if (t.flags & (F.Null | F.Undefined | F.Void)) return 'null';
  if (t.flags & F.NumberLike) return 'number';
  if (t.flags & F.StringLike) return 'string';
  if (t.flags & F.BooleanLike) return 'boolean';
  if (t.flags & F.BigIntLike) return 'number';
  if (checker.isArrayType(t) || checker.isTupleType(t)) return 'array';
  if (t.isIntersection()) {
    const ks = new Set(t.types.map((m) => kindOfType(m, depth + 1)));
    if (ks.has('class')) return 'class';
    if (ks.size === 1) return [...ks][0];
    return 'dict';
  }
  const sym = t.getSymbol() ?? t.aliasSymbol;
  const name = sym?.getName();
  if (name === 'Set' || name === 'ReadonlySet' || name === 'WeakSet') return 'set';
  if (name === 'Map' || name === 'ReadonlyMap' || name === 'WeakMap') return 'map';
  if (name === 'RegExp') return 'regexp';
  if (name === 'Array' || name === 'ReadonlyArray' || name === 'RegExpMatchArray' || name === 'RegExpExecArray' || name === 'Uint8ClampedArray' || name === 'Uint8Array') return 'array';
  if (name === 'Promise') return 'dict';
  // Map/Set iterators are plain arrays here
  if (name === 'MapIterator' || name === 'SetIterator' || name === 'ArrayIterator' || name === 'IterableIterator' || name === 'IteratorObject' || name === 'BuiltinIterator') return 'array';
  if (name === 'String') return 'string';
  if (name === 'Number') return 'number';
  if (name === 'Date') return 'any';
  if (t.getCallSignatures().length && !(sym && sym.flags & ts.SymbolFlags.Class)) {
    if (!t.getProperties().length || name === 'Function' || name === '__function' || name === '__type') return 'func';
  }
  if (sym && (sym.flags & ts.SymbolFlags.Class)) return 'class';
  if (t.flags & F.Object && t.objectFlags & ts.ObjectFlags.Class) return 'class';
  return 'dict';
}
/** type at a location, but undo narrowing to null/never for identifiers (closures can reassign them) */
function typeAt(n) {
  const t = checker.getTypeAtLocation(n);
  if (ts.isIdentifier(n) && (t.flags & (F.Null | F.Undefined | F.Never))) {
    const sym = checker.getSymbolAtLocation(n);
    const d = declOf(sym);
    if (d && ts.isVariableDeclaration(d)) return checker.getTypeOfSymbolAtLocation(sym, d);
  }
  return t;
}
const kindOf = (n) => kindOfType(typeAt(n));
function nullable(n) {
  const t = typeAt(n);
  if (t.flags & (F.Any | F.Unknown | F.Null | F.Undefined)) return true;
  if (t.isUnion()) return t.types.some((m) => m.flags & (F.Null | F.Undefined | F.Void | F.Any));
  return false;
}
function isClassInstance(n) {
  return kindOf(n) === 'class';
}

// ------------------------------------------------------------------ symbol resolution

function resolve(sym) {
  if (!sym) return sym;
  if (sym.flags & ts.SymbolFlags.Alias) {
    try {
      return checker.getAliasedSymbol(sym);
    } catch {
      return sym;
    }
  }
  return sym;
}
function declOf(sym) {
  return sym?.valueDeclaration ?? sym?.declarations?.[0];
}
function isModuleLevel(decl) {
  if (!decl) return false;
  let p = decl.parent;
  if (ts.isVariableDeclaration(decl)) p = decl.parent?.parent?.parent; // VariableDeclarationList → VariableStatement → SourceFile
  return p && ts.isSourceFile(p);
}
function isLibDecl(decl) {
  if (!decl) return false;
  const sf = decl.getSourceFile();
  return program.isSourceFileDefaultLibrary(sf) || /[\\/]typescript[\\/]lib[\\/]/.test(sf.fileName) || /[\\/]@types[\\/]node[\\/]/.test(sf.fileName) || /[\\/]vite[\\/]/.test(sf.fileName);
}
/** a value imported from an npm package */
/** parameter names of the constructor a class without one inherits */
function inheritedCtorParams(cd) {
  for (let k = cd; k; ) {
    const h = k.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
    if (!h) return [];
    const bd = declOf(resolve(checker.getSymbolAtLocation(h.expression)));
    if (!bd) return [];
    if (fromNodeModules(bd)) return ['a0'];
    if (isLibDecl(bd)) return [];
    const ctor = bd.members?.find((m) => ts.isConstructorDeclaration(m) && m.body);
    if (ctor) return ctor.parameters.map((p, i) => 'p' + i);
    k = ts.isClassDeclaration(bd) ? bd : null;
  }
  return [];
}
/** does a base class of this class declaration already have the member? */
function baseHas(cd, name) {
  const sym = checker.getSymbolAtLocation(cd.name);
  if (!sym) return false;
  const t = checker.getDeclaredTypeOfSymbol(sym);
  for (const b of checker.getBaseTypes(t) ?? []) if (b.getProperty(name)) return true;
  return false;
}
function npmRef(d, text) {
  const f = d.getSourceFile().fileName;
  if (f.includes('lz-string')) return 'LZString';
  return `PX.${clsName(d.name?.getText?.() ?? text)}`;
}
function fromNodeModules(decl) {
  return !!decl && decl.getSourceFile().fileName.includes('node_modules') && !isLibDecl(decl);
}

// ------------------------------------------------------------------ emitter

class Fn {
  constructor(node, parent) {
    this.node = node;
    this.parent = parent;
    this.root = parent ? parent.root : this;
    if (!parent) {
      this.used = new Set();
      this.names = new Map();
      this.boxed = new Set();
      this.predeclare = new Map(); // function node → symbols declared at its top (used by an earlier closure)
      this.counter = 0;
    }
  }
}

class ModuleEmitter {
  constructor(sf) {
    this.sf = sf;
    this.cls = moduleClass(sf.fileName);
    this.lines = [];
    this.statics = [];
    this.inits = [];
    this.fn = null;
    this.loops = [];
  }

  tmp(prefix = '_t') {
    const r = this.fn.root;
    // unique in the whole module: field initializers from several Fns can share one _init
    this.tmpSeq = (this.tmpSeq ?? 0) + 1;
    r.counter = this.tmpSeq;
    const n = `${prefix}${r.counter}`;
    r.used.add(n);
    return n;
  }

  // -------------------------------------------------- local names & boxing

  declName(sym, text) {
    const r = this.fn.root;
    if (r.names.has(sym)) return r.names.get(sym);
    let n = safe(text);
    if (r.used.has(n) || this.moduleNames?.has(n)) {
      let k = 2;
      while (r.used.has(`${n}_${k}`)) k++;
      n = `${n}_${k}`;
    }
    r.used.add(n);
    r.names.set(sym, n);
    return n;
  }

  /** Which locals in this function tree must live in a one-element array (captured and reassigned). */
  analyzeBoxing(fnNode, root) {
    const info = new Map(); // sym → { owner, assignedOutside, assignedInClosure, captured, forVar }
    const owner = (n) => {
      let p = n.parent;
      while (p && !ts.isFunctionLike(p) && !ts.isSourceFile(p) && !ts.isClassStaticBlockDeclaration(p)) p = p.parent;
      return p;
    };
    const visit = (n, fnStack) => {
      if (ts.isIdentifier(n)) {
        const sym = checker.getSymbolAtLocation(n);
        const d = declOf(sym);
        if (sym && d && (ts.isVariableDeclaration(d) || ts.isParameter(d)) && !isModuleLevel(d) && d.getSourceFile() === this.sf) {
          const declOwner = ts.isParameter(d) ? d.parent : owner(d);
          const cur = fnStack[fnStack.length - 1];
          let rec = info.get(sym);
          if (!rec) {
            rec = { forVar: ts.isVariableDeclaration(d) && ts.isVariableDeclarationList(d.parent) && d.parent.parent && ts.isForStatement(d.parent.parent), captured: false, assignedOutside: false, assignedInClosure: false };
            info.set(sym, rec);
          }
          const inClosure = cur !== declOwner;
          if (inClosure) {
            rec.captured = true;
            // a closure written before the declaration (JavaScript allows it, GDScript doesn't)
            if (cur.pos < d.pos && !ts.isParameter(d)) rec.early = declOwner;
            // a closure in the variable's own initializer: const b = button(..., () => b.hide())
            else if (ts.isVariableDeclaration(d) && d.initializer && cur !== d.initializer && cur.pos >= d.initializer.pos && cur.end <= d.initializer.end) rec.early = declOwner;
          }
          const p = n.parent;
          const isAssign = (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
            ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) ||
            (ts.isArrayLiteralExpression(p) && ts.isBinaryExpression(p.parent) && p.parent.left === p) ||
            (ts.isShorthandPropertyAssignment(p) && ts.isObjectLiteralExpression(p.parent) && ts.isBinaryExpression(p.parent.parent) && p.parent.parent.left === p.parent);
          if (isAssign) {
            if (inClosure) rec.assignedInClosure = true;
            else {
              // for-loop counters: the incrementor doesn't count (JavaScript copies them per iteration)
              const fs2 = d.parent?.parent;
              const inIncr = rec.forVar && fs2 && fs2.incrementor && n.pos >= fs2.incrementor.pos && n.end <= fs2.incrementor.end;
              if (!inIncr) rec.assignedOutside = true;
            }
          }
        }
      }
      if (ts.isFunctionLike(n) && n !== fnNode) {
        fnStack = [...fnStack, n];
      }
      ts.forEachChild(n, (c) => visit(c, fnStack));
    };
    visit(fnNode, [fnNode]);
    // const f = (...) => ... f(...) ...: a lambda can't see its own variable, so box it
    const visitRec = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) {
        const sym = checker.getSymbolAtLocation(n.name);
        let self = false;
        const scan = (m) => {
          if (self) return;
          if (ts.isIdentifier(m) && checker.getSymbolAtLocation(m) === sym) self = true;
          ts.forEachChild(m, scan);
        };
        scan(n.initializer);
        if (self && !isModuleLevel(n)) root.boxed.add(sym);
      }
      ts.forEachChild(n, visitRec);
    };
    visitRec(fnNode);
    for (const [sym, rec] of info) {
      if (rec.early) {
        root.boxed.add(sym);
        if (!root.predeclare.has(rec.early)) root.predeclare.set(rec.early, []);
        root.predeclare.get(rec.early).push(sym);
        root.predeclared = root.predeclared ?? new Set();
        root.predeclared.add(sym);
        continue;
      }
      if (rec.captured && (rec.assignedInClosure || rec.assignedOutside)) {
        if (rec.forVar && !rec.assignedInClosure) {
          // assigned in the loop body and captured: rare; box anyway (loses per-iteration copies)
        }
        root.boxed.add(sym);
      }
    }
  }

  predeclLines(node, ind) {
    const syms = this.fn.root.predeclare.get(node) ?? [];
    return syms.map((sym) => `${ind}var ${this.declName(sym, declOf(sym).name.getText())} = [null]`);
  }

  localRef(sym, text) {
    const r = this.fn.root;
    const n = r.names.get(sym) ?? this.declName(sym, text);
    return r.boxed.has(sym) ? `${n}[0]` : n;
  }

  // -------------------------------------------------- module

  emit() {
    const sf = this.sf;
    this.moduleNames = new Set();
    const out = [];
    out.push(`## Generated from ${path.relative(REPO, sf.fileName)} by tools/gdport. Do not edit: change the TypeScript.`);
    out.push(`class_name ${this.cls}`);
    out.push('');
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) continue;
      if (ts.isFunctionDeclaration(st)) {
        if (!st.body) continue;
        const ov = OVERRIDES[path.relative(REPO, sf.fileName)];
        if (ov && ov.includes(st.name.text)) {
          // hand-written in port/godot/hand: same name and parameters
          const ps = st.parameters.map((p) => safe(p.name.getText()) + (p.initializer || p.questionToken ? ' = null' : ''));
          const hand = 'H_' + this.cls.slice(2);
          out.push(`static func ${safe(st.name.text)}(${ps.join(', ')}):`);
          const sig = checker.getSignatureFromDeclaration(st);
          const isVoid = sig && checker.getReturnTypeOfSignature(sig).flags & ts.TypeFlags.Void;
          out.push(`\t${isVoid ? '' : 'return '}${hand}.${safe(st.name.text)}(${st.parameters.map((p) => safe(p.name.getText())).join(', ')})`);
          out.push('');
          continue;
        }
        out.push(...this.emitFunction(st, 'static func', st.name.text));
        out.push('');
      } else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) {
            report(d, 'module-level destructuring');
            continue;
          }
          const ov = OVERRIDES[path.relative(REPO, sf.fileName)];
          if (ov && ov.includes(d.name.text) && d.initializer && ts.isArrowFunction(d.initializer)) {
            const ps = d.initializer.parameters.map((p) => safe(p.name.getText()));
            out.push(`static var ${safe(d.name.text)} = (func(${ps.map((p) => p + ' = null').join(', ')}): return H_${this.cls.slice(2)}.${safe(d.name.text)}(${ps.join(', ')}))`);
            continue;
          }
          this.fn = new Fn(st, null);
          const pre = [];
          const init = d.initializer ? this.E(d.initializer, pre) : 'null';
          if (pre.length) {
            // a module-level lambda with a block body: build it in a static function
            const helper = `_init_${d.name.text}`;
            out.push(`static func ${helper}():`);
            out.push(...pre.map((l) => '\t' + l));
            out.push(`\treturn ${init}`);
            out.push(`static var ${safe(d.name.text)} = ${this.cls}.${helper}()`);
          } else out.push(`static var ${safe(d.name.text)} = ${init}`);
          this.fn = null;
        }
      } else if (ts.isClassDeclaration(st)) {
        out.push(...this.emitClass(st));
        out.push('');
      } else if (ts.isEnumDeclaration(st)) {
        report(st, 'enum');
      } else if (ts.isModuleDeclaration(st)) {
        // declare global etc.
      } else {
        this.inits.push(st);
      }
    }
    if (this.inits.length) {
      this.fn = new Fn(this.sf, null);
      this.analyzeBoxing(this.sf, this.fn.root);
      const body = [];
      for (const st of this.inits) this.S(st, body, '\t');
      out.push('static func _static_init():');
      out.push(...(body.length ? body : ['\tpass']));
      this.fn = null;
    }
    return out.join('\n') + '\n';
  }

  // -------------------------------------------------- functions

  /** params → GDScript param list + prologue lines (defaults, destructuring, boxing). */
  params(node, ind) {
    const ps = [];
    const pro = [];
    node.parameters.forEach((p, i) => {
      if (ts.isIdentifier(p.name) && (p.name.text === 'this')) return;
      if (p.dotDotDotToken) {
        const sym = checker.getSymbolAtLocation(p.name);
        const n = this.declName(sym, p.name.text);
        ps.push(`${n} = []`);
        if (this.fn.root.boxed.has(sym)) pro.push(`${ind}${n} = [${n}]`);
        return;
      }
      if (ts.isIdentifier(p.name)) {
        const isProp = p.modifiers?.some((x) => [ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(x.kind));
        const sym = isProp ? checker.getSymbolsOfParameterPropertyDeclaration(p, p.name.text)[0] : checker.getSymbolAtLocation(p.name);
        const n = this.declName(sym, p.name.text);
        const optional = p.questionToken || p.initializer;
        ps.push(optional ? `${n} = null` : n);
        if (p.initializer) {
          const pre = [];
          const v = this.E(p.initializer, pre);
          pro.push(...pre.map((l) => ind + l));
          pro.push(`${ind}if ${n} == null: ${n} = ${v}`);
        }
        if (this.fn.root.boxed.has(sym)) pro.push(`${ind}${n} = [${n}]`);
      } else {
        const n = this.tmp('_p');
        ps.push(p.questionToken || p.initializer ? `${n} = null` : n);
        if (p.initializer) {
          const pre = [];
          const v = this.E(p.initializer, pre);
          pro.push(...pre.map((l) => ind + l));
          pro.push(`${ind}if ${n} == null: ${n} = ${v}`);
        }
        this.destructure(p.name, n, pro, ind, p.type ? checker.getTypeFromTypeNode(p.type) : checker.getTypeAtLocation(p));
      }
    });
    return { ps, pro };
  }

  emitFunction(node, head, name, isMethod = false, extraHook = null) {
    const prevFn = this.fn;
    const prevLoops = this.loops;
    this.loops = [];
    this.fn = new Fn(node, null);
    this.fn.prof = PROFILE && name !== 'constructor';
    this.analyzeBoxing(node, this.fn.root);
    const { ps, pro } = this.params(node, '\t');
    const body = [...pro, ...this.predeclLines(node, '\t')];
    if (node.body) {
      if (ts.isBlock(node.body) && extraHook) {
        // constructors: super() first, then parameter properties and field initializers
        const stmts = node.body.statements;
        const first = stmts[0];
        const isSuper = first && ts.isExpressionStatement(first) && ts.isCallExpression(first.expression) && first.expression.expression.kind === ts.SyntaxKind.SuperKeyword;
        if (isSuper) this.S(first, body, '\t');
        body.push(...extraHook(this, this.fn.root.names));
        this.block(isSuper ? stmts.slice(1) : stmts, body, '\t');
      } else if (ts.isBlock(node.body)) this.block(node.body.statements, body, '\t');
      else {
        const pre = [];
        const v = this.E(node.body, pre);
        body.push(...pre.map((l) => '\t' + l));
        body.push(`\treturn ${v}`);
      }
    }
    const fname = isMethod ? memberName(name) : safe(name);
    if (PROFILE && fname !== '_init' && this.fn.prof) {
      body.unshift(`\tJS.prof_enter(${gdStr(this.cls.slice(2) + '.' + fname)})`);
      body.push('\tJS.prof_exit()');
    }
    const lines = [`${head} ${fname}(${ps.join(', ')}):`, ...(body.length ? body : ['\tpass'])];
    this.fn = prevFn;
    this.loops = prevLoops;
    return lines;
  }

  /** an arrow / function expression → a GDScript lambda (inline if it fits on one line) */
  lambda(node, pre) {
    const fn = new Fn(node, this.fn);
    const prevFn = this.fn;
    const prevLoops = this.loops;
    this.fn = fn;
    this.loops = [];
    const { ps, pro } = this.params(node, '\t');
    let result;
    const body = node.body;
    const assignBody = !ts.isBlock(body) && isAssignmentLike(body);
    if (!ts.isBlock(body) && !assignBody && !pro.length && !this.fn.root.predeclare.has(node)) {
      const inner = [];
      const v = this.E(body, inner);
      if (!inner.length) {
        const isVoid = checker.getTypeAtLocation(body).flags & ts.TypeFlags.Void;
        result = isVoid ? `(func(${ps.join(', ')}): ${v})` : `(func(${ps.join(', ')}): return ${v})`;
      }
    }
    if (!result) {
      const lines = [...pro, ...this.predeclLines(node, '\t')];
      if (ts.isBlock(body)) this.block(body.statements, lines, '\t');
      else if (assignBody) this.exprStatement(body, lines, '\t');
      else {
        const inner = [];
        const v = this.E(body, inner);
        lines.push(...inner.map((l) => '\t' + l));
        lines.push(checker.getTypeAtLocation(body).flags & ts.TypeFlags.Void ? `\t${v}` : `\treturn ${v}`);
      }
      this.fn = prevFn;
      const name = this.tmp('_f');
      pre.push(`var ${name} = func(${ps.join(', ')}):`);
      pre.push(...(lines.length ? lines : ['\tpass']));
      result = name;
    }
    this.fn = prevFn;
    this.loops = prevLoops;
    return result;
  }

  // -------------------------------------------------- classes

  emitClass(node) {
    const name = node.name.text;
    const out = [];
    let ext = '';
    const her = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
    if (her && her.types[0].expression.getText() === 'Error') ext = ' extends RefCounted';
    else if (her) ext = ` extends ${this.typeRef(her.types[0].expression)}`;
    else ext = ' extends RefCounted';
    out.push(`class ${clsName(name)}${ext}:`);
    if (her && her.types[0].expression.getText() === 'Error') {
      out.push('\tvar message = ""');
      if (!node.members.some((m) => ts.isConstructorDeclaration(m))) out.push('\tfunc _init(m = null):', '\t\tmessage = JS.str_(m) if m != null else ""');
    }
    const ctor = node.members.find((m) => ts.isConstructorDeclaration(m) && m.body);
    for (const m of node.members) {
      if (ts.isPropertyDeclaration(m)) {
        const isStatic = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword);
        const nm = memberName(m.name.getText());
        this.fn = new Fn(m, null);
        const pre = [];
        let init = m.initializer ? this.E(m.initializer, pre) : 'null';
        const inherited = !isStatic && her && baseHas(node, m.name.getText());
        if (inherited) {
          if (m.initializer) {
            this.lateInits = this.lateInits ?? [];
            this.lateInits.push({ nm, pre, init });
          }
          this.fn = null;
          continue;
        }
        if (pre.length) {
          // initializer needs statements: assign in _init instead
          this.lateInits = this.lateInits ?? [];
          this.lateInits.push({ nm, pre, init });
          init = 'null';
        }
        out.push(`\t${isStatic ? 'static ' : ''}var ${nm} = ${init}`);
        this.fn = null;
      }
    }
    // parameter properties
    if (ctor) {
      for (const p of ctor.parameters) {
        if (p.modifiers?.some((x) => [ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(x.kind))) {
          out.push(`\tvar ${memberName(p.name.text)} = null`);
        }
      }
    }
    // getters / setters
    const accessors = new Map();
    for (const m of node.members) {
      if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) {
        const nm = m.name.getText();
        const a = accessors.get(nm) ?? {};
        if (ts.isGetAccessor(m)) a.get = m;
        else a.set = m;
        accessors.set(nm, a);
      }
    }
    for (const [nm, a] of accessors) {
      out.push(`\tvar ${memberName(nm)}:`);
      if (a.get) out.push(`\t\tget: return _get_${nm}()`);
      if (a.set) out.push(`\t\tset(value): _set_${nm}(value)`);
    }
    for (const m of node.members) {
      if (ts.isConstructorDeclaration(m) && m.body) {
        const late = this.lateInits ?? [];
        this.lateInits = [];
        const lines = this.emitFunction(m, 'func', '_init', false, (em, names) => {
          const extra = [];
          for (const p of m.parameters) {
            if (p.modifiers?.some((x) => [ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(x.kind))) {
              const sym = checker.getSymbolsOfParameterPropertyDeclaration(p, p.name.text)[0];
              extra.push(`\tself.${memberName(p.name.text)} = ${names.get(sym)}`);
            }
          }
          for (const li of late) {
            extra.push(...li.pre.map((l) => '\t' + l));
            extra.push(`\tself.${li.nm} = ${li.init}`);
          }
          return extra;
        });
        out.push(...lines.map((l) => '\t' + l));
      } else if (ts.isMethodDeclaration(m) && !m.body && m.modifiers?.some((x) => x.kind === ts.SyntaxKind.AbstractKeyword)) {
        out.push(`\tfunc ${memberName(m.name.getText())}(${m.parameters.map((p) => safe(p.name.getText()) + ' = null').join(', ')}):`, '\t\tpass');
      } else if (ts.isMethodDeclaration(m) && m.body) {
        const isStatic = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword);
        out.push(...this.emitFunction(m, isStatic ? 'static func' : 'func', m.name.getText(), true).map((l) => '\t' + l));
      } else if (ts.isGetAccessor(m) && m.body) {
        out.push(...this.emitFunction(m, 'func', `_get_${m.name.getText()}`, false).map((l) => '\t' + l));
      } else if (ts.isSetAccessor(m) && m.body) {
        out.push(...this.emitFunction(m, 'func', `_set_${m.name.getText()}`, false).map((l) => '\t' + l));
      }
    }
    if (this.lateInits?.length) {
      // no constructor: emit one for the late field initializers; it takes the inherited
      // constructor's parameters and passes them up first
      const ps = inheritedCtorParams(node);
      const lines = [`\tfunc _init(${ps.map((p) => p + ' = null').join(', ')}):`];
      if (her && her.types[0].expression.getText() !== 'Error') lines.push(`\t\tsuper(${ps.join(', ')})`);
      for (const li of this.lateInits) {
        lines.push(...li.pre.map((l) => '\t\t' + l));
        lines.push(`\t\tself.${li.nm} = ${li.init}`);
      }
      out.push(...lines);
      this.lateInits = [];
    }
    if (out.length === 1) out.push('\tpass');
    return out;
  }

  typeRef(expr) {
    // a class used as a value (new X, extends X, instanceof X, static access)
    const sym = resolve(checker.getSymbolAtLocation(expr));
    const d = declOf(sym);
    if (d && fromNodeModules(d)) return npmRef(d, expr.getText());
    if (d && ts.isClassDeclaration(d)) return `${moduleClass(d.getSourceFile().fileName)}.${clsName(d.name.text)}`;
    return this.E(expr, []);
  }

  // -------------------------------------------------- statements

  block(stmts, out, ind) {
    // nested function declarations: JavaScript hoists them. Declare a box for each at the top,
    // and create the function at its own position, or just before the first statement that
    // uses it if that comes earlier.
    const fns = stmts.filter((s) => ts.isFunctionDeclaration(s) && s.body);
    const emitAt = new Map(); // statement index → functions to create first
    for (const f of fns) {
      const sym = checker.getSymbolAtLocation(f.name);
      const n = this.declName(sym, f.name.text);
      this.fn.root.boxed.add(sym);
      out.push(`${ind}var ${n} = [null]`);
      let at = stmts.indexOf(f);
      for (let i = 0; i < at; i++) {
        if (ts.isFunctionDeclaration(stmts[i])) continue;
        let used = false;
        const scan = (m) => {
          if (used) return;
          if (ts.isIdentifier(m) && checker.getSymbolAtLocation(m) === sym) used = true;
          ts.forEachChild(m, scan);
        };
        scan(stmts[i]);
        if (used) {
          at = i;
          break;
        }
      }
      if (!emitAt.has(at)) emitAt.set(at, []);
      emitAt.get(at).push(f);
    }
    const createFn = (f) => {
      const sym = checker.getSymbolAtLocation(f.name);
      const pre = [];
      const lam = this.lambda(f, pre);
      out.push(...pre.map((l) => ind + l));
      out.push(`${ind}${this.fn.root.names.get(sym)}[0] = ${lam}`);
    };
    stmts.forEach((s, i) => {
      for (const f of emitAt.get(i) ?? []) createFn(f);
      if (ts.isFunctionDeclaration(s)) return;
      this.S(s, out, ind);
    });
  }

  S(s, out, ind) {
    const pre = [];
    const flush = () => {
      out.push(...pre.map((l) => ind + l));
      pre.length = 0;
    };
    switch (s.kind) {
      case ts.SyntaxKind.Block:
        if (!s.statements.length) return;
        this.block(s.statements, out, ind);
        return;
      case ts.SyntaxKind.EmptyStatement:
        return;
      case ts.SyntaxKind.ExpressionStatement:
        this.exprStatement(s.expression, out, ind);
        return;
      case ts.SyntaxKind.VariableStatement:
        for (const d of s.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) {
            const sym = checker.getSymbolAtLocation(d.name);
            if (this.fn.root.boxed.has(sym) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
              const n = this.declName(sym, d.name.text);
              if (!this.fn.root.predeclared?.has(sym)) out.push(`${ind}var ${n} = [null]`);
              const v2 = this.E(d.initializer, pre);
              flush();
              out.push(`${ind}${n}[0] = ${v2}`);
              continue;
            }
            const v = d.initializer ? this.E(d.initializer, pre) : 'null';
            flush();
            const n = this.declName(sym, d.name.text);
            if (this.fn.root.predeclared?.has(sym)) out.push(`${ind}${n}[0] = ${v}`);
            else out.push(`${ind}var ${n} = ${this.fn.root.boxed.has(sym) ? `[${v}]` : v}`);
          } else {
            const v = this.E(d.initializer, pre);
            flush();
            const t = this.tmp();
            out.push(`${ind}var ${t} = ${v}`);
            this.destructure(d.name, t, out, ind, checker.getTypeAtLocation(d.initializer));
          }
        }
        return;
      case ts.SyntaxKind.ReturnStatement: {
        const v = s.expression ? this.E(s.expression, pre) : '';
        flush();
        if (this.fn.prof) {
          if (v) out.push(`${ind}var _pr = ${v}`);
          out.push(`${ind}JS.prof_exit()`);
          out.push(`${ind}return${v ? ' _pr' : ''}`);
          return;
        }
        out.push(`${ind}return${v ? ' ' + v : ''}`);
        return;
      }
      case ts.SyntaxKind.IfStatement: {
        const c = this.B(s.expression, pre);
        flush();
        out.push(`${ind}if ${c}:`);
        this.body(s.thenStatement, out, ind + '\t');
        let el = s.elseStatement;
        while (el) {
          if (ts.isIfStatement(el)) {
            const p2 = [];
            const c2 = this.B(el.expression, p2);
            if (p2.length) {
              out.push(`${ind}else:`);
              this.S(el, out, ind + '\t');
              break;
            }
            out.push(`${ind}elif ${c2}:`);
            this.body(el.thenStatement, out, ind + '\t');
            el = el.elseStatement;
          } else {
            out.push(`${ind}else:`);
            this.body(el, out, ind + '\t');
            break;
          }
        }
        return;
      }
      case ts.SyntaxKind.ForOfStatement: {
        const it = this.iterExpr(s.expression, pre);
        flush();
        const init = s.initializer;
        const decl = ts.isVariableDeclarationList(init) ? init.declarations[0] : null;
        this.loops.push({ inc: [] });
        if (decl && ts.isIdentifier(decl.name)) {
          const sym = checker.getSymbolAtLocation(decl.name);
          const n = this.declName(sym, decl.name.text);
          if (this.fn.root.boxed.has(sym)) {
            const t = this.tmp('_it');
            out.push(`${ind}for ${t} in ${it}:`);
            out.push(`${ind}\tvar ${n} = [${t}]`);
          } else out.push(`${ind}for ${n} in ${it}:`);
        } else if (decl) {
          const t = this.tmp('_it');
          out.push(`${ind}for ${t} in ${it}:`);
          this.destructure(decl.name, t, out, ind + '\t', checker.getTypeAtLocation(s.expression), true);
        } else {
          const t = this.tmp('_it');
          out.push(`${ind}for ${t} in ${it}:`);
          out.push(`${ind}\t${this.assignTarget(init, t, [])}`);
        }
        this.body(s.statement, out, ind + '\t');
        this.loops.pop();
        return;
      }
      case ts.SyntaxKind.ForInStatement: {
        const o = this.E(s.expression, pre);
        flush();
        const decl = s.initializer.declarations[0];
        const sym = checker.getSymbolAtLocation(decl.name);
        const n = this.declName(sym, decl.name.text);
        this.loops.push({ inc: [] });
        out.push(`${ind}for ${n} in JS.keys(${o}):`);
        this.body(s.statement, out, ind + '\t');
        this.loops.pop();
        return;
      }
      case ts.SyntaxKind.ForStatement: {
        if (s.initializer) {
          if (ts.isVariableDeclarationList(s.initializer)) this.S(ts.factory.createVariableStatement(undefined, s.initializer), out, ind);
          else this.exprStatement(s.initializer, out, ind);
        }
        const inc = [];
        if (s.incrementor) this.exprStatement(s.incrementor, inc, '');
        const cp = [];
        const c = s.condition ? this.B(s.condition, cp) : 'true';
        if (cp.length) {
          out.push(`${ind}while true:`);
          out.push(...cp.map((l) => ind + '\t' + l));
          out.push(`${ind}\tif not (${c}): break`);
        } else out.push(`${ind}while ${c}:`);
        this.loops.push({ inc });
        const bodyLines = [];
        this.body(s.statement, bodyLines, ind + '\t');
        this.loops.pop();
        out.push(...bodyLines);
        out.push(...inc.map((l) => ind + '\t' + l));
        return;
      }
      case ts.SyntaxKind.WhileStatement: {
        const c = this.B(s.expression, pre);
        if (pre.length) {
          out.push(`${ind}while true:`);
          out.push(...pre.map((l) => ind + '\t' + l));
          out.push(`${ind}\tif not (${c}): break`);
          pre.length = 0;
        } else out.push(`${ind}while ${c}:`);
        this.loops.push({ inc: [] });
        this.body(s.statement, out, ind + '\t');
        this.loops.pop();
        return;
      }
      case ts.SyntaxKind.DoStatement: {
        out.push(`${ind}while true:`);
        this.loops.push({ inc: [], doWhile: true });
        this.body(s.statement, out, ind + '\t');
        this.loops.pop();
        const c = this.B(s.expression, pre);
        out.push(...pre.map((l) => ind + '\t' + l));
        out.push(`${ind}\tif not (${c}): break`);
        return;
      }
      case ts.SyntaxKind.BreakStatement:
        if (s.label) report(s, 'labeled break');
        if (this.inSwitch && this.inSwitch.depth === this.loops.length) {
          // the break that ends a case: nothing to do in an if/elif chain (or leave the while-true wrapper)
          if (this.inSwitch.wrap) out.push(`${ind}break`);
          return;
        }
        out.push(`${ind}break`);
        return;
      case ts.SyntaxKind.ContinueStatement: {
        if (s.label) report(s, 'labeled continue');
        const loop = this.loops[this.loops.length - 1];
        if (loop?.doWhile) report(s, 'continue inside do-while');
        if (loop) out.push(...loop.inc.map((l) => ind + l));
        out.push(`${ind}continue`);
        return;
      }
      case ts.SyntaxKind.SwitchStatement:
        this.switchStatement(s, out, ind);
        return;
      case ts.SyntaxKind.ThrowStatement: {
        const v = this.E(s.expression, pre);
        flush();
        out.push(`${ind}JS.error(${v})`);
        out.push(`${ind}return${this.inReturningFunction() ? ' null' : ''}`);
        return;
      }
      case ts.SyntaxKind.TryStatement:
        // GDScript has no exceptions: run the try block (and finally)
        this.block(s.tryBlock.statements, out, ind);
        if (s.finallyBlock) this.block(s.finallyBlock.statements, out, ind);
        return;
      case ts.SyntaxKind.FunctionDeclaration:
        // handled by block()
        return;
      case ts.SyntaxKind.ClassDeclaration:
        report(s, 'class inside a function');
        return;
      case ts.SyntaxKind.LabeledStatement:
        report(s, 'labeled statement');
        this.S(s.statement, out, ind);
        return;
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.TypeAliasDeclaration:
        return;
      default:
        report(s, 'statement ' + ts.SyntaxKind[s.kind]);
    }
  }

  inReturningFunction() {
    const n = this.fn?.node;
    if (!n || !ts.isFunctionLike(n)) return false;
    if (ts.isConstructorDeclaration(n)) return false;
    const sig = checker.getSignatureFromDeclaration(n);
    if (!sig) return true;
    const rt = checker.getReturnTypeOfSignature(sig);
    return !(rt.flags & F.Void);
  }

  body(st, out, ind) {
    const before = out.length;
    if (ts.isBlock(st)) this.block(st.statements, out, ind);
    else this.S(st, out, ind);
    if (out.length === before) out.push(`${ind}pass`);
  }

  switchStatement(s, out, ind) {
    // a break before the end of a case can't be expressed in an if-chain: run the chain inside
    // `while true:` so that break leaves it (only when no continue targets an outer loop)
    const scan = (pred) => {
      let found = false;
      const visit = (m) => {
        if (found) return;
        if (pred(m)) found = true;
        if (ts.isIterationStatement(m, false) || (ts.isSwitchStatement(m) && m !== s) || ts.isFunctionLike(m)) return;
        ts.forEachChild(m, visit);
      };
      s.caseBlock.clauses.forEach((c) => c.statements.forEach((x) => visit(x)));
      return found;
    };
    const midBreak = s.caseBlock.clauses.some((c) => {
      const st = c.statements.length === 1 && ts.isBlock(c.statements[0]) ? c.statements[0].statements : c.statements;
      return st.some((x, k) => {
        let f = false;
        const visit = (m) => {
          if (f) return;
          if (ts.isBreakStatement(m) && !m.label && !(k === st.length - 1 && m === x)) f = true;
          if (ts.isIterationStatement(m, false) || ts.isSwitchStatement(m) || ts.isFunctionLike(m)) return;
          ts.forEachChild(m, visit);
        };
        visit(x);
        return f;
      });
    });
    const wrap = midBreak && !scan((m) => ts.isContinueStatement(m));
    if (midBreak && !wrap) report(s, 'break inside a switch case (not at the end) with a continue');
    if (wrap) {
      out.push(`${ind}while true:`);
      ind += '\t';
    }
    const pre = [];
    const v = this.E(s.expression, pre);
    out.push(...pre.map((l) => ind + l));
    const t = this.tmp('_sw');
    out.push(`${ind}var ${t} = ${v}`);
    const clauses = s.caseBlock.clauses;
    let first = true;
    let pending = [];
    const prevSwitch = this.inSwitch;
    this.inSwitch = { depth: this.loops.length, wrap };
    const kind = kindOf(s.expression);
    let wroteElse = false;
    for (let i = 0; i < clauses.length; i++) {
      const c = clauses[i];
      if (ts.isDefaultClause(c)) {
        if (c.statements.length === 0 && i < clauses.length - 1) {
          pending.push(null);
          continue;
        }
      } else if (c.statements.length === 0) {
        pending.push(c.expression);
        continue;
      }
      const conds = [...pending, ts.isDefaultClause(c) ? null : c.expression];
      pending = [];
      const isDefault = conds.includes(null);
      // validate: the clause must end in break/return/throw/continue (no fallthrough with code)
      const last = c.statements[c.statements.length - 1];
      if (i < clauses.length - 1 && last && !(ts.isBreakStatement(last) || ts.isReturnStatement(last) || ts.isThrowStatement(last) || ts.isContinueStatement(last) || (ts.isBlock(last) && last.statements.length && [ts.SyntaxKind.BreakStatement, ts.SyntaxKind.ReturnStatement, ts.SyntaxKind.ThrowStatement].includes(last.statements[last.statements.length - 1].kind)))) {
        report(c, 'switch fallthrough with code');
      }
      // a break that isn't the last statement of the clause can't be expressed in an if-chain
      const stmts = c.statements.length === 1 && ts.isBlock(c.statements[0]) ? c.statements[0].statements : c.statements;
      stmts.forEach((x, k) => {
        const hasInnerBreak = (n) => {
          let found = false;
          const visit = (m) => {
            if (found) return;
            if (ts.isBreakStatement(m) && !m.label) found = true;
            if (ts.isIterationStatement(m, false) || ts.isSwitchStatement(m) || ts.isFunctionLike(m)) return;
            ts.forEachChild(m, visit);
          };
          visit(n);
          return found;
        };
        void hasInnerBreak;
      });
      if (isDefault) {
        if (first) {
          out.push(`${ind}if true:`);
        } else out.push(`${ind}else:`);
        wroteElse = true;
      } else {
        const cp = [];
        const parts = conds.map((e) => {
          const ev = this.E(e, cp);
          const k2 = kindOf(e);
          if ((k2 === 'string' || k2 === 'number' || k2 === 'boolean') && (kind === k2)) return `${t} == ${ev}`;
          return `JS.eq(${t}, ${ev})`;
        });
        if (cp.length) report(c, 'case expression needs statements');
        out.push(`${ind}${first ? 'if' : 'elif'} ${parts.join(' or ')}:`);
      }
      first = false;
      this.body(ts.factory.createBlock(stmts), out, ind + '\t');
    }
    this.inSwitch = prevSwitch;
    if (first) out.push(`${ind}pass`);
    if (wrap) out.push(`${ind}break`);
  }

  // -------------------------------------------------- destructuring

  destructure(pattern, src, out, ind, type, isFor = false) {
    if (ts.isArrayBindingPattern(pattern)) {
      pattern.elements.forEach((el, i) => {
        if (ts.isOmittedExpression(el)) return;
        if (el.dotDotDotToken) {
          const sym = checker.getSymbolAtLocation(el.name);
          const n = this.declName(sym, el.name.text);
          out.push(`${ind}var ${n} = JS.slice(${src}, ${i}.0)`);
          return;
        }
        let v = `JS.ai(${src}, ${i})`;
        if (el.initializer) v = `JS.nc(${v}, ${this.E(el.initializer, [])})`;
        if (ts.isIdentifier(el.name)) {
          const sym = checker.getSymbolAtLocation(el.name);
          const n = this.declName(sym, el.name.text);
          out.push(`${ind}var ${n} = ${this.fn.root.boxed.has(sym) ? `[${v}]` : v}`);
        } else {
          const t = this.tmp();
          out.push(`${ind}var ${t} = ${v}`);
          this.destructure(el.name, t, out, ind, undefined);
        }
      });
    } else if (ts.isObjectBindingPattern(pattern)) {
      const taken = [];
      pattern.elements.forEach((el) => {
        if (el.dotDotDotToken) {
          const sym = checker.getSymbolAtLocation(el.name);
          const n = this.declName(sym, el.name.text);
          out.push(`${ind}var ${n} = JS.spread_obj([${src}])`);
          for (const k of taken) out.push(`${ind}${n}.erase(${JSON.stringify(k)})`);
          return;
        }
        const key = el.propertyName ? el.propertyName.getText() : el.name.getText();
        taken.push(key);
        let v = `JS.g(${src}, ${JSON.stringify(key)})`;
        if (el.initializer) v = `JS.nc(${v}, ${this.E(el.initializer, [])})`;
        if (ts.isIdentifier(el.name)) {
          const sym = checker.getSymbolAtLocation(el.name);
          const n = this.declName(sym, el.name.text);
          out.push(`${ind}var ${n} = ${this.fn.root.boxed.has(sym) ? `[${v}]` : v}`);
        } else {
          const t = this.tmp();
          out.push(`${ind}var ${t} = ${v}`);
          this.destructure(el.name, t, out, ind, undefined);
        }
      });
    }
  }

  // -------------------------------------------------- expression statements & assignment

  exprStatement(e, out, ind) {
    const pre = [];
    const flush = () => {
      out.push(...pre.map((l) => ind + l));
      pre.length = 0;
    };
    e = skipParens(e);
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.CommaToken) {
        this.exprStatement(e.left, out, ind);
        this.exprStatement(e.right, out, ind);
        return;
      }
      if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) {
        // a = b = c
        if (op === ts.SyntaxKind.EqualsToken && ts.isBinaryExpression(skipParens(e.right)) && skipParens(e.right).operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          this.exprStatement(e.right, out, ind);
          const v = this.E(skipParens(e.right).left, pre);
          flush();
          out.push(ind + this.assignTarget(e.left, v, pre));
          return;
        }
        const lines = this.assign(e.left, op, e.right, pre);
        flush();
        out.push(...lines.map((l) => ind + l));
        return;
      }
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        // `cond && doThing()` as a statement
        const c = op === ts.SyntaxKind.QuestionQuestionToken ? `${this.E(e.left, pre)} == null` : op === ts.SyntaxKind.AmpersandAmpersandToken ? this.B(e.left, pre) : `not ${this.B(e.left, pre)}`;
        flush();
        out.push(`${ind}if ${c}:`);
        this.exprStatement(e.right, out, ind + '\t');
        return;
      }
    }
    if ((ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e)) && (e.operator === ts.SyntaxKind.PlusPlusToken || e.operator === ts.SyntaxKind.MinusMinusToken)) {
      const t = this.lvalue(e.operand, pre);
      flush();
      const opTxt = e.operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-';
      if (t.raw) out.push(`${ind}${t.raw} ${opTxt}= 1.0`);
      else if (/^[\w.\[\]]+$/.test(t.read)) out.push(`${ind}${t.read} ${opTxt}= 1.0`);
      else out.push(`${ind}${t.write(`(${t.read} ${opTxt} 1.0)`)}`);
      return;
    }
    if (ts.isConditionalExpression(e)) {
      const c = this.B(e.condition, pre);
      flush();
      out.push(`${ind}if ${c}:`);
      this.exprStatement(e.whenTrue, out, ind + '\t');
      out.push(`${ind}else:`);
      this.exprStatement(e.whenFalse, out, ind + '\t');
      return;
    }
    if (ts.isDeleteExpression(e)) {
      const x = skipParens(e.expression);
      if (ts.isPropertyAccessExpression(x)) out.push(`${ind}JS.del(${this.E(x.expression, pre)}, ${JSON.stringify(x.name.text)})`);
      else if (ts.isElementAccessExpression(x)) out.push(`${ind}JS.del(${this.E(x.expression, pre)}, ${this.E(x.argumentExpression, pre)})`);
      const last = out.pop();
      flush();
      out.push(last);
      return;
    }
    if (ts.isVoidExpression(e)) {
      this.exprStatement(e.expression, out, ind);
      return;
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && !e.questionDotToken && !e.expression.questionDotToken) {
      // forEach with an inline function → a plain loop (closures can't write to outer locals)
      const name = e.expression.name.text;
      const rk = kindOf(e.expression.expression);
      if (name === 'forEach' && (rk === 'array' || rk === 'set' || rk === 'map') && e.arguments[0] && (ts.isArrowFunction(e.arguments[0]) || ts.isFunctionExpression(e.arguments[0]))) {
        const f = e.arguments[0];
        const src = this.E(e.expression.expression, pre);
        flush();
        const arr = this.tmp('_a');
        out.push(`${ind}var ${arr} = ${rk === 'array' ? src : rk === 'set' ? `${src}.values()` : `${src}.entries()`}`);
        const idx = this.tmp('_i');
        out.push(`${ind}for ${idx} in ${arr}.size():`);
        // bind params
        const params = f.parameters;
        const bind = (p, val) => {
          if (!p) return;
          if (ts.isIdentifier(p.name)) {
            const sym = checker.getSymbolAtLocation(p.name);
            const n = this.declName(sym, p.name.text);
            out.push(`${ind}\tvar ${n} = ${this.fn.root.boxed.has(sym) ? `[${val}]` : val}`);
          } else {
            const t = this.tmp();
            out.push(`${ind}\tvar ${t} = ${val}`);
            this.destructure(p.name, t, out, ind + '\t', undefined);
          }
        };
        if (rk === 'map') {
          bind(params[0], `${arr}[${idx}][1]`);
          bind(params[1], `${arr}[${idx}][0]`);
        } else {
          bind(params[0], `${arr}[${idx}]`);
          bind(params[1], rk === 'set' ? `${arr}[${idx}]` : `float(${idx})`);
          bind(params[2], arr);
        }
        // `return` inside the callback = continue
        this.loops.push({ inc: [] });
        const prevRet = this.returnIsContinue;
        this.returnIsContinue = true;
        const before = out.length;
        if (ts.isBlock(f.body)) this.block(f.body.statements, out, ind + '\t');
        else this.exprStatement(f.body, out, ind + '\t');
        if (out.length === before) out.push(`${ind}\tpass`);
        this.returnIsContinue = prevRet;
        this.loops.pop();
        // rewrite returns we emitted as continues
        for (let i = before; i < out.length; i++) {
          if (/^\s*return( null)?$/.test(out[i]) && out[i].startsWith(ind + '\t')) out[i] = out[i].replace(/return( null)?$/, 'continue');
        }
        return;
      }
    }
    const v = this.E(e, pre, true);
    flush();
    if (v) out.push(`${ind}${v}`);
  }

  /** an assignable place: read expression + write(value) statement */
  lvalue(target, pre) {
    target = skipParens(target);
    if (ts.isIdentifier(target)) {
      const r = this.ident(target);
      return { read: r, write: (v) => `${r} = ${v}` };
    }
    if (ts.isPropertyAccessExpression(target)) {
      const objK = kindOf(target.expression);
      const o = this.E(target.expression, pre);
      const name = target.name.text;
      if (objK === 'class' && !this.isDictMember(target)) {
        const r = `${o}.${memberName(name)}`;
        return { read: r, write: (v) => `${r} = ${v}` };
      }
      if (objK === 'array' && name === 'length') return { read: `JS.len_(${o})`, write: (v) => `${o}.resize(int(${v}))` };
      if (objK === 'any') return { read: `JS.g(${o}, ${JSON.stringify(name)})`, write: (v) => `JS.s(${o}, ${JSON.stringify(name)}, ${v})` };
      const r = `${o}[${JSON.stringify(name)}]`;
      return { read: `${o}.get(${JSON.stringify(name)})`, write: (v) => `${r} = ${v}`, raw: r };
    }
    if (ts.isElementAccessExpression(target)) {
      const objK = kindOf(target.expression);
      const o = this.E(target.expression, pre);
      const ik = kindOf(target.argumentExpression);
      const i = this.E(target.argumentExpression, pre);
      const tn = checker.getTypeAtLocation(target.expression).getSymbol()?.getName();
      if (tn === 'Uint8ClampedArray' || tn === 'Uint8Array') return { read: `JS.ai(${o}, ${i})`, write: (v) => `JS.u8c_set(${o}, ${i}, ${v})` };
      if (objK === 'array') return { read: `JS.ai(${o}, ${i})`, write: (v) => `JS.set_idx(${o}, ${i}, ${v})` };
      if (objK === 'dict') {
        const key = ik === 'string' ? i : `JS.key(${i})`;
        return { read: `${o}.get(${key})`, write: (v) => `${o}[${key}] = ${v}`, raw: `${o}[${key}]` };
      }
      return { read: `JS.idx(${o}, ${i})`, write: (v) => `JS.set_idx(${o}, ${i}, ${v})` };
    }
    report(target, 'unsupported assignment target');
    return { read: 'null', write: (v) => `pass # ${v}` };
  }

  assignTarget(target, value, pre) {
    target = skipParens(target);
    if (ts.isArrayLiteralExpression(target)) {
      const t = this.tmp();
      const lines = [`var ${t} = ${value}`];
      target.elements.forEach((el, i) => {
        if (ts.isOmittedExpression(el)) return;
        lines.push(this.lvalue(el, pre).write(`JS.ai(${t}, ${i})`));
      });
      return lines.join('\n' + '\t'.repeat(0));
    }
    return this.lvalue(target, pre).write(value);
  }

  assign(target, op, right, pre) {
    target = skipParens(target);
    const K = ts.SyntaxKind;
    if (op === K.EqualsToken) {
      if (ts.isArrayLiteralExpression(target)) {
        const v = this.E(right, pre);
        const t = this.tmp();
        const lines = [`var ${t} = ${v}`];
        target.elements.forEach((el, i) => {
          if (ts.isOmittedExpression(el)) return;
          lines.push(this.lvalue(el, pre).write(`JS.ai(${t}, ${i})`));
        });
        return lines;
      }
      if (ts.isObjectLiteralExpression(target)) {
        report(target, 'object destructuring assignment');
        return [];
      }
      const lv = this.lvalue(target, pre);
      const v = this.E(right, pre);
      return [lv.write(v)];
    }
    const lv = this.lvalue(target, pre);
    if (op === K.QuestionQuestionEqualsToken) {
      const v = this.E(right, pre);
      return [`if ${lv.read} == null:`, `\t${lv.write(v)}`];
    }
    if (op === K.BarBarEqualsToken) {
      const v = this.E(right, pre);
      return [`if not JS.truthy(${lv.read}):`, `\t${lv.write(v)}`];
    }
    if (op === K.AmpersandAmpersandEqualsToken) {
      const v = this.E(right, pre);
      return [`if JS.truthy(${lv.read}):`, `\t${lv.write(v)}`];
    }
    const binop = {
      [K.PlusEqualsToken]: K.PlusToken, [K.MinusEqualsToken]: K.MinusToken, [K.AsteriskEqualsToken]: K.AsteriskToken,
      [K.SlashEqualsToken]: K.SlashToken, [K.PercentEqualsToken]: K.PercentToken, [K.AsteriskAsteriskEqualsToken]: K.AsteriskAsteriskToken,
      [K.BarEqualsToken]: K.BarToken, [K.AmpersandEqualsToken]: K.AmpersandToken, [K.CaretEqualsToken]: K.CaretToken,
      [K.LessThanLessThanEqualsToken]: K.LessThanLessThanToken, [K.GreaterThanGreaterThanEqualsToken]: K.GreaterThanGreaterThanToken,
      [K.GreaterThanGreaterThanGreaterThanEqualsToken]: K.GreaterThanGreaterThanGreaterThanToken,
    }[op];
    const v = this.binary(binop, target, right, pre, lv.read);
    return [lv.write(v)];
  }

  isDictMember(pa) {
    // a property on a class-typed receiver that's declared in an interface/type literal (not on the class)
    const sym = checker.getSymbolAtLocation(pa.name);
    const d = declOf(sym);
    if (!d) return false;
    return ts.isPropertySignature(d) || ts.isPropertyAssignment(d);
  }

  // -------------------------------------------------- expressions

  /** boolean context */
  B(n, pre) {
    n = skipParens(n);
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) return `(not ${this.B(n.operand, pre)})`;
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return this.Bjoin(n, pre, true);
      if (op === ts.SyntaxKind.BarBarToken) return this.Bjoin(n, pre, false);
    }
    const k = kindOf(n);
    const v = this.E(n, pre);
    // reads from records/arrays can be missing even when the type says otherwise
    const maybe = nullable(n) || ts.isElementAccessExpression(n) || ts.isPropertyAccessExpression(n);
    if (k === 'boolean') return maybe ? `(${v} == true)` : v;
    if (k === 'number') return maybe ? `JS.truthy(${v})` : `(${v} != 0.0)`;
    if (k === 'string') return maybe ? `JS.truthy(${v})` : `(${v} != "")`;
    if (['dict', 'class', 'array', 'func', 'set', 'map', 'regexp'].includes(k)) return `(${v} != null)`;
    if (k === 'null') return 'false';
    return `JS.truthy(${v})`;
  }

  /** a && b / a || b in boolean context, where b may need statements (they must only run when needed) */
  Bjoin(n, pre, isAnd) {
    const a = this.B(n.left, pre);
    const inner = [];
    const b = this.B(n.right, inner);
    if (!inner.length) return `(${a} ${isAnd ? 'and' : 'or'} ${b})`;
    const t = this.tmp();
    pre.push(`var ${t} = ${a}`);
    pre.push(`if ${isAnd ? '' : 'not '}${t}:`);
    pre.push(...inner.map((l) => '\t' + l));
    pre.push(`\t${t} = ${b}`);
    return t;
  }

  /** value context; stmt = result unused (expression statement) */
  E(n, pre, stmt = false) {
    const K = ts.SyntaxKind;
    switch (n.kind) {
      case K.NumericLiteral:
        return numLit(n.text);
      case K.StringLiteral:
      case K.NoSubstitutionTemplateLiteral:
        return gdStr(n.text);
      case K.TrueKeyword:
        return 'true';
      case K.FalseKeyword:
        return 'false';
      case K.NullKeyword:
        return 'null';
      case K.ThisKeyword:
        return 'self';
      case K.SuperKeyword:
        return 'super';
      case K.Identifier:
        return this.ident(n);
      case K.ParenthesizedExpression:
        return `(${this.E(n.expression, pre)})`;
      case K.AsExpression:
      case K.NonNullExpression:
      case K.TypeAssertionExpression:
      case K.SatisfiesExpression:
        return this.E(n.expression, pre, stmt);
      case K.TemplateExpression: {
        const parts = [];
        if (n.head.text) parts.push(gdStr(n.head.text));
        for (const sp of n.templateSpans) {
          parts.push(this.S_(sp.expression, pre));
          if (sp.literal.text) parts.push(gdStr(sp.literal.text));
        }
        return parts.length ? `(${parts.join(' + ')})` : '""';
      }
      case K.RegularExpressionLiteral: {
        const m = /^\/(.*)\/([a-z]*)$/s.exec(n.text);
        return `JS.re(${gdStr(m[1])}, ${gdStr(m[2])})`;
      }
      case K.ArrayLiteralExpression: {
        if (n.elements.some((e) => ts.isSpreadElement(e))) {
          const parts = n.elements.map((e) => (ts.isSpreadElement(e) ? `[true, ${this.E(e.expression, pre)}]` : `[false, ${this.E(e, pre)}]`));
          return `JS.arr_spread([${parts.join(', ')}])`;
        }
        return `[${n.elements.map((e) => (ts.isOmittedExpression(e) ? 'null' : this.E(e, pre))).join(', ')}]`;
      }
      case K.ObjectLiteralExpression:
        return this.objectLiteral(n, pre);
      case K.ArrowFunction:
      case K.FunctionExpression:
        return this.lambda(n, pre);
      case K.PropertyAccessExpression:
        return this.propAccess(n, pre);
      case K.ElementAccessExpression:
        return this.elemAccess(n, pre);
      case K.CallExpression:
        return this.call(n, pre, stmt);
      case K.NewExpression:
        return this.newExpr(n, pre);
      case K.ConditionalExpression: {
        const c = this.B(n.condition, pre);
        const ia = [];
        const a = this.E(n.whenTrue, ia);
        const ib = [];
        const b = this.E(n.whenFalse, ib);
        if (!ia.length && !ib.length) return `(${a} if ${c} else ${b})`;
        const t = this.tmp();
        pre.push(`var ${t} = null`);
        pre.push(`if ${c}:`);
        pre.push(...ia.map((l) => '\t' + l));
        pre.push(`\t${t} = ${a}`);
        pre.push('else:');
        pre.push(...ib.map((l) => '\t' + l));
        pre.push(`\t${t} = ${b}`);
        return t;
      }
      case K.PrefixUnaryExpression: {
        const op = n.operator;
        if (op === K.ExclamationToken) return `(not ${this.B(n.operand, pre)})`;
        if (op === K.MinusToken) return `(-${this.N(n.operand, pre)})`;
        if (op === K.PlusToken) return `JS.num(${this.E(n.operand, pre)})`;
        if (op === K.TildeToken) return `JS.bnot(${this.E(n.operand, pre)})`;
        if (op === K.PlusPlusToken || op === K.MinusMinusToken) {
          const lv = this.lvalue(n.operand, pre);
          pre.push(lv.write(`(${lv.read} ${op === K.PlusPlusToken ? '+' : '-'} 1.0)`));
          return lv.read;
        }
        break;
      }
      case K.PostfixUnaryExpression: {
        const lv = this.lvalue(n.operand, pre);
        const t = this.tmp();
        pre.push(`var ${t} = ${lv.read}`);
        pre.push(lv.write(`(${t} ${n.operator === K.PlusPlusToken ? '+' : '-'} 1.0)`));
        return t;
      }
      case K.TypeOfExpression: {
        // typeof <browser global>: what the Godot stand-ins provide
        if (ts.isIdentifier(n.expression)) {
          const d = declOf(resolve(checker.getSymbolAtLocation(n.expression)));
          if (d && isLibDecl(d) && !fromNodeModules(d)) {
            const t = n.expression.text;
            if (DOM_OBJS.has(t) || t === 'localStorage') return '"object"';
            if (DOM_CLASSES.has(t) || ['requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'Audio', 'setTimeout', 'Promise'].includes(t)) return '"function"';
            return '"undefined"';
          }
        }
        return `JS.type_of(${this.E(n.expression, pre)})`;
      }
      case K.VoidExpression:
        return 'null';
      case K.DeleteExpression:
        report(n, 'delete as a value');
        return 'true';
      case K.BinaryExpression:
        return this.binExpr(n, pre, stmt);
      case K.SpreadElement:
        report(n, 'spread here');
        return this.E(n.expression, pre);
      case K.AwaitExpression:
        return `JS.await_(${this.E(n.expression, pre)})`;
      case K.ClassExpression:
        report(n, 'class expression');
        return 'null';
    }
    report(n, 'expression ' + ts.SyntaxKind[n.kind]);
    return 'null';
  }

  /** a branch of ?: — hoisted lambdas would run eagerly; keep them lazy */
  lazy(n, pre) {
    const inner = [];
    const v = this.E(n, inner);
    if (!inner.length) return v;
    // only lambdas defined there? defining a lambda is harmless: hoist it
    if (inner.every((l) => /^var _f\d+ = func\(|^\t/.test(l))) {
      pre.push(...inner);
      return v;
    }
    const lam = this.tmp('_l');
    pre.push(`var ${lam} = func():`);
    pre.push(...inner.map((l) => '\t' + l));
    pre.push(`\treturn ${v}`);
    return `${lam}.call()`;
  }

  /** as a number */
  N(n, pre) {
    const k = kindOf(n);
    const v = this.E(n, pre);
    return k === 'number' && !nullable(n) ? v : k === 'number' ? v : `JS.num(${v})`;
  }

  /** as a string (template literal / concatenation part) */
  S_(n, pre) {
    const k = kindOf(n);
    const v = this.E(n, pre);
    if (k === 'string' && !nullable(n)) return v;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) return v;
    return `JS.str_(${v})`;
  }

  ident(n, symOverride) {
    const text = n.text;
    if (text === '__APP_VERSION__') return gdStr(JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version);
    if (text === 'undefined') return 'null';
    if (text === 'NaN') return 'NAN';
    if (text === 'Infinity') return 'INF';
    const sym0 = symOverride ?? checker.getSymbolAtLocation(n);
    if (!sym0) {
      report(n, 'unresolved identifier ' + text);
      return safe(text);
    }
    const sym = resolve(sym0);
    const d = declOf(sym);
    if (!d) return safe(text);
    if (fromNodeModules(d)) return npmRef(d, text);
    if (isLibDecl(d)) {
      if (DOM_OBJS.has(text) || DOM_CLASSES.has(text)) return `DOM.${text}`;
      if (text === 'Promise') return 'JSPromise';
      return GLOBAL_IDENTS[text] ?? (report(n, 'global ' + text), safe(text));
    }
    const sf = d.getSourceFile();
    if (ts.isClassDeclaration(d)) return `${moduleClass(sf.fileName)}.${clsName(d.name.text)}`;
    if (ts.isFunctionDeclaration(d) && isModuleLevel(d)) return `${moduleClass(sf.fileName)}.${safe(d.name.text)}`;
    if (isModuleLevel(d)) return `${moduleClass(sf.fileName)}.${safe(text)}`;
    if (ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d)) {
      report(n, 'unresolved import ' + text);
      return safe(text);
    }
    // a local (or a parameter / nested function)
    return this.localRef(sym0, text);
  }

  objectLiteral(n, pre) {
    const groups = [];
    let cur = [];
    const flushGroup = () => {
      if (cur.length) groups.push(`{${cur.join(', ')}}`);
      cur = [];
    };
    for (const p of n.properties) {
      if (ts.isSpreadAssignment(p)) {
        flushGroup();
        groups.push(this.E(p.expression, pre));
        continue;
      }
      let key;
      if (p.name && ts.isComputedPropertyName(p.name)) {
        const kk = kindOf(p.name.expression);
        key = kk === 'string' ? this.E(p.name.expression, pre) : `JS.key(${this.E(p.name.expression, pre)})`;
      } else if (p.name) {
        key = gdStr(ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name) ? String(p.name.text) : p.name.getText());
      }
      if (ts.isPropertyAssignment(p)) {
        let v = this.E(p.initializer, pre);
        if (/^\(func\(/.test(v)) {
          // inline lambdas inside dict literals confuse the parser: hoist
          const t = this.tmp('_f');
          pre.push(`var ${t} = ${v}`);
          v = t;
        }
        cur.push(`${key}: ${v}`);
      } else if (ts.isShorthandPropertyAssignment(p)) {
        cur.push(`${key}: ${this.ident(p.name, checker.getShorthandAssignmentValueSymbol(p))}`);
      } else if (ts.isMethodDeclaration(p)) {
        const lam = this.lambda(p, pre);
        let v = lam;
        if (/^\(func\(/.test(v)) {
          const t = this.tmp('_f');
          pre.push(`var ${t} = ${v}`);
          v = t;
        }
        cur.push(`${key}: ${v}`);
      } else {
        report(p, 'object literal member ' + ts.SyntaxKind[p.kind]);
      }
    }
    if (groups.length === 0) return `{${cur.join(', ')}}`;
    flushGroup();
    return `JS.spread_obj([${groups.join(', ')}])`;
  }

  propAccess(n, pre) {
    if (n.getText().replace(/\s/g, '') === 'import.meta.env.BASE_URL') return '"res://public/"';
    const objN = n.expression;
    const name = n.name.text;
    // globals: Math.PI, Number.MAX_SAFE_INTEGER ...
    if (ts.isIdentifier(objN)) {
      const s = resolve(checker.getSymbolAtLocation(objN));
      const d = declOf(s);
      if (d && isLibDecl(d) && !fromNodeModules(d)) {
        const g = GLOBAL_PROPS[`${objN.text}.${name}`];
        if (g) return g;
        if (DOM_OBJS.has(objN.text)) return `DOM.${objN.text}.${memberName(name)}`;
        report(n, `global property ${objN.text}.${name}`);
        return 'null';
      }
      if (s && s.flags & ts.SymbolFlags.Module && !(d && fromNodeModules(d) && s.flags & ts.SymbolFlags.Class)) {
        // namespace import
        const target = declOf(resolve(checker.getSymbolAtLocation(n.name)));
        if (target) return `${moduleClass(target.getSourceFile().fileName)}.${safe(name)}`;
      }
    }
    // enum-like static class members
    const memberSym = checker.getSymbolAtLocation(n.name);
    const md = declOf(memberSym);
    const objK = kindOf(objN);
    const o = this.E(objN, pre);
    const opt = !!n.questionDotToken || isInOptionalChain(n);
    if (md && (ts.isMethodDeclaration(md) || ts.isPropertyDeclaration(md) || ts.isGetAccessor(md)) && md.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword) && ts.isClassDeclaration(md.parent)) {
      return `${this.typeRefForClass(md.parent)}.${memberName(name)}`;
    }
    if (objK === 'array' || objK === 'string') {
      if (name === 'length') return opt ? `JS.len_(${o})` : objK === 'array' ? `float(${o}.size())` : `float(${o}.length())`;
      report(n, `property ${name} of ${objK}`);
      return 'null';
    }
    if (objK === 'set' || objK === 'map') {
      if (name === 'size') return `${o}.size`;
    }
    if (objK === 'class' && !this.isDictMember(n)) {
      if (opt) return pureExpr(objN) ? `(null if ${o} == null else ${o}.${memberName(name)})` : `JS.og(${o}, ${gdStr(memberName(name))})`;
      return `${o}.${memberName(name)}`;
    }
    if (objK === 'func') {
      report(n, `property ${name} of a function`);
      return 'null';
    }
    if (objK === 'any') return opt ? `JS.og(${o}, ${gdStr(name)})` : `JS.g(${o}, ${gdStr(name)})`;
    // dict
    if (opt) return pureExpr(objN) ? `(null if ${o} == null else ${o}.get(${gdStr(name)}))` : `JS.og(${o}, ${gdStr(name)})`;
    return `${o}.get(${gdStr(name)})`;
  }

  typeRefForClass(cd) {
    if (fromNodeModules(cd)) return npmRef(cd, cd.name.text);
    return `${moduleClass(cd.getSourceFile().fileName)}.${clsName(cd.name.text)}`;
  }

  elemAccess(n, pre) {
    const objK = kindOf(n.expression);
    const o = this.E(n.expression, pre);
    const ik = kindOf(n.argumentExpression);
    const i = this.E(n.argumentExpression, pre);
    const opt = !!n.questionDotToken || isInOptionalChain(n);
    const wrap = (v) => (opt ? (pureExpr(n.expression) ? `(null if ${o} == null else ${v})` : `JS.idx(${o}, ${i})`) : v);
    if (objK === 'array') {
      // a tuple read at a constant index in range: plain indexing
      const t = checker.getTypeAtLocation(n.expression);
      if (!opt && checker.isTupleType(t) && ts.isNumericLiteral(n.argumentExpression)) {
        const k = Number(n.argumentExpression.text);
        const fixed = t.target?.fixedLength ?? checker.getTypeArguments(t).length;
        const minLen = t.target?.minLength ?? fixed;
        if (Number.isInteger(k) && k < minLen) return `${o}[${k}]`;
      }
      return wrap(`JS.ai(${o}, ${i})`);
    }
    if (objK === 'string') return wrap(`JS.s_idx(${o}, ${i})`);
    if (objK === 'dict') return wrap(`${o}.get(${ik === 'string' ? i : `JS.key(${i})`})`);
    if (objK === 'map') return wrap(`${o}.get_(${i})`);
    return `JS.idx(${o}, ${i})`;
  }

  args(nodes, pre) {
    const out = [];
    for (const a of nodes) {
      if (!ts.isSpreadElement(a)) {
        out.push(this.E(a, pre));
        continue;
      }
      const t = checker.getTypeAtLocation(a.expression);
      if (checker.isTupleType(t)) {
        // f(...tuple): a fixed number of arguments
        const n = (t.target?.fixedLength ?? checker.getTypeArguments(t).length);
        const tmp = this.tmp();
        pre.push(`var ${tmp} = ${this.E(a.expression, pre)}`);
        for (let i = 0; i < n; i++) out.push(`${tmp}[${i}]`);
        continue;
      }
      report(a, 'spread argument');
      out.push(this.E(a.expression, pre));
    }
    return out;
  }

  call(n, pre, stmt) {
    const callee = skipParens(n.expression);
    // Object.prototype.hasOwnProperty.call(o, k)
    if (callee.getText().replace(/\s/g, '') === 'Object.prototype.hasOwnProperty.call') return `JS.has(${this.E(n.arguments[0], pre)}, ${this.E(n.arguments[1], pre)})`;
    // f(...args)
    if (n.arguments.length === 1 && ts.isSpreadElement(n.arguments[0]) && !ts.isPropertyAccessExpression(callee)) return `JS.call_(${this.E(callee, pre)}, ${this.E(n.arguments[0].expression, pre)})`;
    if (callee.kind === ts.SyntaxKind.ImportKeyword) {
      const spec = n.arguments[0];
      const r = ts.resolveModuleName(spec.text, n.getSourceFile().fileName, program.getCompilerOptions(), ts.sys);
      const f = r.resolvedModule?.resolvedFileName;
      if (!f) {
        report(n, 'dynamic import of ' + spec.text);
        return 'null';
      }
      return `JSPromise.resolve(${moduleClass(path.resolve(f))})`;
    }
    const optCall = !!n.questionDotToken;
    // super(...)
    if (callee.kind === ts.SyntaxKind.SuperKeyword) return `super(${this.args(n.arguments, pre).join(', ')})`;
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      const recv = callee.expression;
      if (recv.kind === ts.SyntaxKind.SuperKeyword) return `super.${memberName(name)}(${this.args(n.arguments, pre).join(', ')})`;
      // globals
      if (ts.isIdentifier(recv)) {
        const s = resolve(checker.getSymbolAtLocation(recv));
        const d = declOf(s);
        if (d && isLibDecl(d) && !fromNodeModules(d)) {
          const key = `${recv.text}.${name}`;
          const h = GLOBAL_CALLS[key];
          if (h) return h(this, n.arguments, pre, n);
          if (DOM_OBJS.has(recv.text)) return `DOM.${recv.text}.${memberName(name)}(${this.args(n.arguments, pre).join(', ')})`;
          if (recv.text === 'Promise') return `JSPromise.${name}(${this.args(n.arguments, pre).join(', ')})`;
          report(n, 'global call ' + key);
          return 'null';
        }
        if (s && s.flags & ts.SymbolFlags.Module && !(d && fromNodeModules(d) && s.flags & ts.SymbolFlags.Class)) {
          const target = declOf(resolve(checker.getSymbolAtLocation(callee.name)));
          if (target && fromNodeModules(target)) return `${npmRef(target, recv.text)}.${callee.name.text}(${this.args(n.arguments, pre).join(', ')})`;
          if (target) return this.directCall(target, n, pre);
        }
      }
      const rk = kindOf(recv);
      const optRecv = !!callee.questionDotToken || isInOptionalChain(callee);
      const r = this.E(recv, pre);
      const guard = (v) => {
        if (!optRecv) return v;
        if (pureExpr(recv)) return `(null if ${r} == null else ${v})`;
        const t = this.tmp('_o');
        pre.push(`var ${t} = ${r}`);
        return `(null if ${t} == null else ${v.split(r).join(t)})`;
      };
      {
        const md0 = declOf(checker.getSymbolAtLocation(callee.name));
        if (md0 && fromNodeModules(md0) && (ts.isMethodDeclaration(md0) || ts.isMethodSignature(md0))) {
          return guard(`${r}.${memberName(name)}(${this.args(n.arguments, pre).join(', ')})`);
        }
      }
      const methodHandlers = rk === 'array' ? ARRAY_METHODS : rk === 'string' ? STRING_METHODS : rk === 'number' ? NUMBER_METHODS : rk === 'set' ? SET_METHODS : rk === 'map' ? MAP_METHODS : rk === 'regexp' ? REGEXP_METHODS : null;
      if (methodHandlers) {
        const h = methodHandlers[name];
        if (h) return guard(h(this, r, n.arguments, pre, n, stmt));
        report(n, `${rk} method ${name}`);
        return 'null';
      }
      if (rk === 'func') {
        if (name === 'call') return guard(`JS.call_(${r}, [${this.args(n.arguments.slice(1), pre).join(', ')}])`);
        if (name === 'apply') return guard(`JS.call_(${r}, ${this.E(n.arguments[1], pre)})`);
        if (name === 'bind') return r;
        report(n, `function method ${name}`);
        return 'null';
      }
      // class instance method or a function-valued property
      const msym = checker.getSymbolAtLocation(callee.name);
      const md = declOf(msym);
      const a = this.args(n.arguments, pre);
      if (md && (ts.isMethodDeclaration(md) || ts.isMethodSignature(md)) && rk === 'class' && !ts.isMethodSignature(md)) {
        const isStatic = md.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword);
        const tgt = isStatic ? this.typeRefForClass(md.parent) : r;
        const trimmed = this.trimArgs(md, a);
        const v = `${tgt}.${memberName(name)}(${trimmed.join(', ')})`;
        return optCall ? `(null if ${tgt}.${memberName(name)} == null else ${v})` : guard(v);
      }
      if (rk === 'class' && md && ts.isPropertyDeclaration(md)) {
        const f = `${r}.${memberName(name)}`;
        return guard(optCall ? `(null if ${f} == null else JS.call_(${f}, [${a.join(', ')}]))` : `JS.call_(${f}, [${a.join(', ')}])`);
      }
      if (rk === 'class' && md && fromNodeModules(md)) {
        return guard(`${r}.${memberName(name)}(${a.join(', ')})`);
      }
      // dict / any / interface method: works for Dictionaries and Objects alike
      const v = `JS.invoke(${r}, ${gdStr(name)}, [${a.join(', ')}])`;
      if (optCall) return guard(`(null if JS.g(${r}, ${gdStr(name)}) == null else ${v})`);
      return guard(v);
    }
    if (ts.isIdentifier(callee)) {
      const s0 = checker.getSymbolAtLocation(callee);
      const s = resolve(s0);
      const d = declOf(s);
      if (d && isLibDecl(d) && !fromNodeModules(d)) {
        const h = GLOBAL_FUNCS[callee.text];
        if (h) return h(this, n.arguments, pre, n);
        report(n, 'global function ' + callee.text);
        return 'null';
      }
      if (d && ts.isFunctionDeclaration(d) && isModuleLevel(d)) return this.directCall(d, n, pre);
      if (d && fromNodeModules(d)) return `PX.${callee.text}(${this.args(n.arguments, pre).join(', ')})`;
    }
    // a local arrow function called with an argument count it accepts: call it directly
    if (ts.isIdentifier(callee) && !optCall && !n.arguments.some((x) => ts.isSpreadElement(x))) {
      const d = declOf(resolve(checker.getSymbolAtLocation(callee)));
      const init = d && ts.isVariableDeclaration(d) && d.parent.flags & ts.NodeFlags.Const ? d.initializer : null;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && !init.parameters.some((p) => p.dotDotDotToken)) {
        const required = init.parameters.filter((p) => !p.initializer && !p.questionToken).length;
        if (n.arguments.length >= required && n.arguments.length <= init.parameters.length) {
          const f = this.E(callee, pre);
          return `${f}.call(${this.args(n.arguments, pre).join(', ')})`;
        }
      }
    }
    // a callable value
    const f = this.E(callee, pre);
    const a = this.args(n.arguments, pre);
    if (optCall) return `(null if ${f} == null else JS.call_(${f}, [${a.join(', ')}]))`;
    return `JS.call_(${f}, [${a.join(', ')}])`;
  }

  trimArgs(decl, args) {
    const ps = decl.parameters ?? [];
    const rest = ps.length && ps[ps.length - 1].dotDotDotToken;
    if (rest) {
      const fixed = ps.length - 1;
      return [...args.slice(0, fixed), `[${args.slice(fixed).join(', ')}]`];
    }
    return args.length > ps.length ? args.slice(0, ps.length) : args;
  }

  directCall(decl, n, pre) {
    const a = this.args(n.arguments, pre);
    const cls = moduleClass(decl.getSourceFile().fileName);
    // overloads: use the implementation's parameters
    let impl = decl;
    if (!impl.body) {
      const sym = checker.getSymbolAtLocation(decl.name);
      impl = sym?.declarations?.find((x) => x.body) ?? decl;
    }
    return `${cls}.${safe(decl.name.text)}(${this.trimArgs(impl, a).join(', ')})`;
  }

  newExpr(n, pre) {
    const a = this.args(n.arguments ?? [], pre);
    const c = n.expression;
    if (ts.isIdentifier(c)) {
      const s = resolve(checker.getSymbolAtLocation(c));
      const d = declOf(s);
      if (d && isLibDecl(d) && !fromNodeModules(d)) {
        switch (c.text) {
          case 'Set':
            return `JSSet.new(${a[0] ?? ''})`;
          case 'Map':
          case 'WeakMap':
            return `JSMap.new(${a[0] ?? ''})`;
          case 'WeakSet':
            return `JSSet.new(${a[0] ?? ''})`;
          case 'Error':
            return a[0] ?? '""';
          case 'RegExp':
            return `JS.re(${a[0]}, ${a[1] ?? '""'})`;
          case 'Array':
            return `JS.array_new(${a[0] ?? ''})`;
          case 'Date':
            return `JS.date(${a.join(', ')})`;
          case 'Uint8ClampedArray':
          case 'Uint8Array':
            return `JS.u8c(${a[0] ?? '0.0'})`;
          case 'Promise':
            return `JSPromise.new(${a[0] ?? ''})`;
          case 'Audio':
            return `DOM.Audio.new(${a[0] ?? ''})`;
          case 'ResizeObserver':
            return `DOM.ResizeObserver.new(${a[0] ?? ''})`;
          case 'KeyboardEvent':
          case 'PointerEvent':
          case 'WheelEvent':
          case 'MouseEvent':
          case 'TouchEvent':
          case 'Event':
          case 'CustomEvent':
            return `DOM.DomEvent.new(${a.join(', ')})`;
        }
        report(n, 'new ' + c.text);
        return 'null';
      }
      if (d && fromNodeModules(d)) return `${npmRef(d, c.text)}.new(${a.join(', ')})`;
      if (d && ts.isClassDeclaration(d)) {
        // the constructor may be inherited (from a user class, or Error's message)
        let args = [];
        for (let k = d; k; ) {
          const ctor = k.members.find((m) => ts.isConstructorDeclaration(m) && m.body);
          if (ctor) {
            args = this.trimArgs(ctor, a);
            break;
          }
          const h = k.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
          if (!h) break;
          const bd = declOf(resolve(checker.getSymbolAtLocation(h.expression)));
          if (bd && isLibDecl(bd)) {
            if (h.expression.getText() === 'Error') args = a.slice(0, 1);
            break;
          }
          k = bd && ts.isClassDeclaration(bd) ? bd : null;
        }
        return `${this.typeRefForClass(d)}.new(${args.join(', ')})`;
      }
    }
    if (ts.isPropertyAccessExpression(c)) {
      const d = declOf(resolve(checker.getSymbolAtLocation(c.name)));
      if (d && ts.isClassDeclaration(d) && !fromNodeModules(d)) {
        const ctor = d.members.find((m) => ts.isConstructorDeclaration(m) && m.body);
        return `${this.typeRefForClass(d)}.new(${(ctor ? this.trimArgs(ctor, a) : []).join(', ')})`;
      }
    }
    report(n, 'new of ' + c.getText());
    return 'null';
  }

  binExpr(n, pre, stmt) {
    const K = ts.SyntaxKind;
    const op = n.operatorToken.kind;
    if (op >= K.FirstAssignment && op <= K.LastAssignment) {
      // hoist the assignment into a statement, then read the target
      const lines = this.assign(n.left, op, n.right, pre);
      pre.push(...lines);
      return this.lvalue(n.left, pre).read;
    }
    if (op === K.CommaToken) {
      report(n, 'comma expression');
      return 'null';
    }
    if (op === K.AmpersandAmpersandToken || op === K.BarBarToken) {
      const lk = kindOf(n.left);
      const rk = kindOf(n.right);
      const resultK = kindOf(n);
      if (resultK === 'boolean' || (lk === 'boolean' && rk === 'boolean')) return this.B(n, pre);
      const a = this.E(n.left, pre);
      const inner = [];
      const b = this.E(n.right, inner);
      const bc = this.B(n.left, []);
      if (!inner.length && pureExpr(n.left)) {
        return op === K.BarBarToken ? `(${a} if ${bc} else ${b})` : `(${b} if ${bc} else ${a})`;
      }
      const t = this.tmp();
      pre.push(`var ${t} = ${a}`);
      pre.push(`if ${op === K.BarBarToken ? 'not ' : ''}JS.truthy(${t}):`);
      pre.push(...inner.map((l) => '\t' + l));
      pre.push(`\t${t} = ${b}`);
      return t;
    }
    if (op === K.QuestionQuestionToken) {
      const a = this.E(n.left, pre);
      const inner = [];
      const b = this.E(n.right, inner);
      if (!inner.length && pureExpr(n.right)) return `JS.nc(${a}, ${b})`;
      if (!inner.length && pureExpr(n.left)) return `(${b} if ${a} == null else ${a})`;
      const t = this.tmp();
      pre.push(`var ${t} = ${a}`);
      pre.push(`if ${t} == null:`);
      pre.push(...inner.map((l) => '\t' + l));
      pre.push(`\t${t} = ${b}`);
      return t;
    }
    return this.binary(op, n.left, n.right, pre);
  }

  binary(op, left, right, pre, leftExpr) {
    const K = ts.SyntaxKind;
    const lk = kindOf(left);
    const rk = kindOf(right);
    const L = () => leftExpr ?? this.E(left, pre);
    const R = () => this.E(right, pre);
    const isNullLit = (x) => x.kind === K.NullKeyword || (ts.isIdentifier(x) && x.text === 'undefined') || ts.isVoidExpression(x);
    switch (op) {
      case K.PlusToken: {
        if (lk === 'number' && rk === 'number') return `(${L()} + ${R()})`;
        if (lk === 'string' || rk === 'string') {
          const a = leftExpr ? (lk === 'string' && !nullable(left) ? leftExpr : `JS.str_(${leftExpr})`) : this.S_(left, pre);
          return `(${a} + ${this.S_(right, pre)})`;
        }
        return `JS.add(${L()}, ${R()})`;
      }
      case K.MinusToken:
        return `(${this.numSide(left, lk, L())} - ${this.numSide(right, rk, R())})`;
      case K.AsteriskToken:
        return `(${this.numSide(left, lk, L())} * ${this.numSide(right, rk, R())})`;
      case K.SlashToken:
        return `(${this.numSide(left, lk, L())} / ${this.numSide(right, rk, R())})`;
      case K.PercentToken:
        return `fmod(${L()}, ${R()})`;
      case K.AsteriskAsteriskToken:
        return `pow(${L()}, ${R()})`;
      case K.LessThanToken:
      case K.GreaterThanToken:
      case K.LessThanEqualsToken:
      case K.GreaterThanEqualsToken: {
        const sym = { [K.LessThanToken]: '<', [K.GreaterThanToken]: '>', [K.LessThanEqualsToken]: '<=', [K.GreaterThanEqualsToken]: '>=' }[op];
        if ((lk === 'number' && rk === 'number') || (lk === 'string' && rk === 'string')) {
          if (nullable(left) || nullable(right)) return `(JS.num(${L()}) ${sym} JS.num(${R()}))`;
          return `(${L()} ${sym} ${R()})`;
        }
        return `(JS.num(${L()}) ${sym} JS.num(${R()}))`;
      }
      case K.EqualsEqualsEqualsToken:
      case K.ExclamationEqualsEqualsToken:
      case K.EqualsEqualsToken:
      case K.ExclamationEqualsToken: {
        const neg = op === K.ExclamationEqualsEqualsToken || op === K.ExclamationEqualsToken;
        if (isNullLit(right)) return `(${L()} ${neg ? '!=' : '=='} null)`;
        if (isNullLit(left)) return `(${R()} ${neg ? '!=' : '=='} null)`;
        const prim = ['number', 'string', 'boolean'];
        if (lk === rk && prim.includes(lk) && !(nullable(left) && nullable(right))) {
          if (!nullable(left) && !nullable(right)) return `(${L()} ${neg ? '!=' : '=='} ${R()})`;
        }
        const objk = ['dict', 'array', 'class', 'set', 'map', 'func', 'regexp'];
        if (objk.includes(lk) && objk.includes(rk)) return `(${neg ? 'not ' : ''}is_same(${L()}, ${R()}))`;
        return `${neg ? 'JS.neq' : 'JS.eq'}(${L()}, ${R()})`;
      }
      case K.InstanceOfKeyword:
        return `(${L()} is ${this.typeRef(right)})`;
      case K.InKeyword:
        return `JS.has(${R()}, ${L()})`;
      case K.BarToken:
        return `JS.bor(${L()}, ${R()})`;
      case K.AmpersandToken:
        return `JS.band(${L()}, ${R()})`;
      case K.CaretToken:
        return `JS.bxor(${L()}, ${R()})`;
      case K.LessThanLessThanToken:
        return `JS.shl(${L()}, ${R()})`;
      case K.GreaterThanGreaterThanToken:
        return `JS.shr(${L()}, ${R()})`;
      case K.GreaterThanGreaterThanGreaterThanToken:
        return `JS.ushr(${L()}, ${R()})`;
    }
    report(left.parent, 'operator ' + ts.SyntaxKind[op]);
    return 'null';
  }

  numSide(node, k, v) {
    return k === 'number' ? v : `JS.num(${v})`;
  }

  iterExpr(e, pre) {
    const k = kindOf(e);
    const v = this.E(e, pre);
    if (k === 'array') return v;
    if (k === 'set') return `${v}.values()`;
    if (k === 'map') return `${v}.entries()`;
    return `JS.iter(${v})`;
  }
}

// ------------------------------------------------------------------ helpers

function skipParens(n) {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression?.(n) || ts.isSatisfiesExpression?.(n))) n = n.expression;
  return n;
}
function isAssignmentLike(n) {
  n = skipParens(n);
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) return true;
    if (op === ts.SyntaxKind.CommaToken) return true;
  }
  if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  if (ts.isDeleteExpression(n)) return true;
  if (ts.isVoidExpression(n)) return true;
  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'forEach') return true;
  return false;
}
function pureExpr(n) {
  n = skipParens(n);
  if (!n) return true;
  if (ts.isIdentifier(n) || n.kind === ts.SyntaxKind.ThisKeyword || ts.isLiteralExpression(n) || n.kind === ts.SyntaxKind.NullKeyword || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isPropertyAccessExpression(n)) return pureExpr(n.expression);
  if (ts.isElementAccessExpression(n)) return pureExpr(n.expression) && pureExpr(n.argumentExpression);
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken) return pureExpr(n.operand);
  return false;
}
function isInOptionalChain(n) {
  // part of a?.b.c: a link after the ?. (TypeScript marks the whole chain)
  return !!(n.flags & ts.NodeFlags.OptionalChain) && !n.questionDotToken;
}
function numLit(text) {
  const v = Number(text.replace(/_/g, ''));
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return `${v}.0`;
  const s = String(v);
  return /[.e]/.test(s) ? s : s + '.0';
}
function gdStr(s) {
  return JSON.stringify(s).split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
}

// ------------------------------------------------------------------ built-ins

const a1 = (em, args, pre, i = 0) => (args[i] ? em.E(args[i], pre) : 'null');
const lst = (em, args, pre) => args.map((x) => em.E(x, pre)).join(', ');
const spreadOrList = (em, args, pre) => {
  if (args.length === 1 && ts.isSpreadElement(args[0])) return em.E(args[0].expression, pre);
  if (args.some((x) => ts.isSpreadElement(x))) return `JS.arr_spread([${args.map((x) => (ts.isSpreadElement(x) ? `[true, ${em.E(x.expression, pre)}]` : `[false, ${em.E(x, pre)}]`)).join(', ')}])`;
  return `[${lst(em, args, pre)}]`;
};

/** browser globals provided by rt/dom.gd */
/** Godot's built-in class names: a script class can't reuse one (Container, Button, Input...) */
const NATIVE = new Set(JSON.parse(fs.readFileSync(path.join(REPO, 'tools/gdport/godot_classes.json'), 'utf8')));
const clsName = (n) => (NATIVE.has(n) ? n + '_' : safe(n));
/** GDPROF=1: every function records its own time (JS.prof_report) */
const PROFILE = !!process.env.GDPROF;
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(REPO, 'tools/gdport/overrides.json'), 'utf8'));
const DOM_OBJS = new Set(['window', 'document', 'navigator', 'location']);
const DOM_CLASSES = new Set(['Audio', 'ResizeObserver', 'KeyboardEvent', 'PointerEvent', 'WheelEvent', 'MouseEvent', 'TouchEvent', 'Event', 'CustomEvent']);
const GLOBAL_IDENTS = { Math: 'null', console: 'null', JSON: 'null', undefined: 'null', NaN: 'NAN', Infinity: 'INF', Boolean: 'JS.truthy', localStorage: 'JS.local_storage()', String: 'JS.str_', Number: 'JS.num' };
const GLOBAL_PROPS = {
  'Math.PI': 'PI', 'Math.E': '2.718281828459045', 'Math.SQRT2': '1.4142135623730951', 'Math.LN2': '0.6931471805599453', 'Math.LN10': '2.302585092994046',
  'Number.MAX_SAFE_INTEGER': '9007199254740991.0', 'Number.MIN_SAFE_INTEGER': '-9007199254740991.0', 'Number.EPSILON': '2.220446049250313e-16',
  'Math.min': '(func(a, b): return minf(JS.num(a), JS.num(b)))', 'Math.max': '(func(a, b): return maxf(JS.num(a), JS.num(b)))',
  'Math.abs': '(func(a): return absf(JS.num(a)))', 'Math.round': '(func(a): return JS.round_(JS.num(a)))', 'Math.floor': '(func(a): return floor(JS.num(a)))', 'Math.ceil': '(func(a): return ceil(JS.num(a)))',
  'Number.POSITIVE_INFINITY': 'INF', 'Number.NEGATIVE_INFINITY': '-INF', 'Number.MAX_VALUE': '1.7976931348623157e308', 'Number.NaN': 'NAN',
};
const math1 = (fn) => (em, args, pre) => `${fn}(${em.N(args[0], pre)})`;
const GLOBAL_CALLS = {
  'Math.floor': math1('floor'), 'Math.ceil': math1('ceil'), 'Math.round': math1('JS.round_'), 'Math.abs': math1('absf'), 'Math.sqrt': math1('sqrt'),
  'Math.sin': math1('sin'), 'Math.cos': math1('cos'), 'Math.tan': math1('tan'), 'Math.atan': math1('atan'), 'Math.asin': math1('asin'), 'Math.acos': math1('acos'),
  'Math.exp': math1('exp'), 'Math.log': math1('log'), 'Math.log10': math1('JS.log10'), 'Math.log2': (em, a, p) => `(log(${em.N(a[0], p)}) / log(2.0))`,
  'Math.trunc': math1('JS.trunc'), 'Math.sign': math1('JS.sign_'), 'Math.cbrt': (em, a, p) => `pow(${em.N(a[0], p)}, 1.0 / 3.0)`,
  'Math.atan2': (em, a, p) => `atan2(${em.N(a[0], p)}, ${em.N(a[1], p)})`,
  'Math.pow': (em, a, p) => `pow(${em.N(a[0], p)}, ${em.N(a[1], p)})`,
  'Math.hypot': (em, a, p) => `JS.hypot(${lst(em, a, p)})`,
  'Math.imul': (em, a, p) => `JS.imul(${lst(em, a, p)})`,
  'Math.max': (em, a, p) => (a.length === 2 && !a.some((x) => ts.isSpreadElement(x)) ? `maxf(${em.N(a[0], p)}, ${em.N(a[1], p)})` : `JS.max_(${spreadOrList(em, a, p)})`),
  'Math.min': (em, a, p) => (a.length === 2 && !a.some((x) => ts.isSpreadElement(x)) ? `minf(${em.N(a[0], p)}, ${em.N(a[1], p)})` : `JS.min_(${spreadOrList(em, a, p)})`),
  'Math.random': () => 'randf()',
  'Object.keys': (em, a, p) => `JS.keys(${a1(em, a, p)})`,
  'Object.values': (em, a, p) => `JS.values(${a1(em, a, p)})`,
  'Object.entries': (em, a, p) => `JS.entries(${a1(em, a, p)})`,
  'Object.fromEntries': (em, a, p) => `JS.from_entries(${a1(em, a, p)})`,
  'Object.assign': (em, a, p) => `JS.assign(${a1(em, a, p)}, [${a.slice(1).map((x) => em.E(x, p)).join(', ')}])`,
  'Object.freeze': (em, a, p) => a1(em, a, p),
  'JSON.stringify': (em, a, p) => `JS.json_stringify(${lst(em, a, p)})`,
  'JSON.parse': (em, a, p) => `JS.json_parse(${a1(em, a, p)})`,
  'Array.isArray': (em, a, p) => `(${a1(em, a, p)} is Array)`,
  'Array.from': (em, a, p) => `JS.array_from(${lst(em, a, p)})`,
  'Array.of': (em, a, p) => `[${lst(em, a, p)}]`,
  'Number.isFinite': (em, a, p) => `JS.is_finite(${a1(em, a, p)})`,
  'Number.isInteger': (em, a, p) => `JS.is_integer(${a1(em, a, p)})`,
  'Number.isNaN': (em, a, p) => `JS.is_nan_(${a1(em, a, p)})`,
  'Number.parseFloat': (em, a, p) => `JS.parse_float(${a1(em, a, p)})`,
  'Number.parseInt': (em, a, p) => `JS.parse_int(${lst(em, a, p)})`,
  'String.fromCharCode': (em, a, p) => `JS.from_char_code([${lst(em, a, p)}])`,
  'console.log': (em, a, p) => `JS.log_([${lst(em, a, p)}])`,
  'console.warn': (em, a, p) => `JS.log_([${lst(em, a, p)}])`,
  'console.error': (em, a, p) => `JS.log_([${lst(em, a, p)}])`,
  'console.info': (em, a, p) => `JS.log_([${lst(em, a, p)}])`,
  'Date.now': () => 'JS.now()',
  'performance.now': () => 'float(Time.get_ticks_usec()) / 1000.0',
};
const GLOBAL_FUNCS = {
  parseInt: (em, a, p) => `JS.parse_int(${lst(em, a, p)})`,
  parseFloat: (em, a, p) => `JS.parse_float(${a1(em, a, p)})`,
  isNaN: (em, a, p) => `JS.is_nan_(${a1(em, a, p)})`,
  isFinite: (em, a, p) => `JS.is_finite(JS.num(${a1(em, a, p)}))`,
  Number: (em, a, p) => (a.length ? `JS.num(${a1(em, a, p)})` : '0.0'),
  String: (em, a, p) => `JS.str_(${a1(em, a, p)})`,
  Boolean: (em, a, p) => `JS.truthy(${a1(em, a, p)})`,
  structuredClone: (em, a, p) => `JS.clone(${a1(em, a, p)})`,
  Symbol: (em, a, p) => `{"__symbol": ${a.length ? em.E(a[0], p) : '""'}}`,
  setTimeout: (em, a, p) => `JS.set_timeout(${lst(em, a, p)})`,
  clearTimeout: (em, a, p) => `JS.clear_timeout(${a1(em, a, p)})`,
  setInterval: (em, a, p) => `JS.set_interval(${lst(em, a, p)})`,
  clearInterval: (em, a, p) => `JS.clear_timeout(${a1(em, a, p)})`,
  requestAnimationFrame: (em, a, p) => `DOM.requestAnimationFrame(${a1(em, a, p)})`,
  cancelAnimationFrame: (em, a, p) => `DOM.cancelAnimationFrame(${a1(em, a, p)})`,
  matchMedia: (em, a, p) => `DOM.matchMedia(${a1(em, a, p)})`,
  queueMicrotask: (em, a, p) => `JS.queue_microtask(${a1(em, a, p)})`,
  encodeURIComponent: (em, a, p) => `${a1(em, a, p)}.uri_encode()`,
  decodeURIComponent: (em, a, p) => `${a1(em, a, p)}.uri_decode()`,
  btoa: (em, a, p) => `Marshalls.utf8_to_base64(${a1(em, a, p)})`,
  atob: (em, a, p) => `Marshalls.base64_to_utf8(${a1(em, a, p)})`,
};

/** callback argument: functions keep their arity, so JS.call_ can pass (value, index, array) */
const cb = (em, args, pre, i = 0) => em.E(args[i], pre);

const ARRAY_METHODS = {
  next: (em, r) => `JS.iter_next(${r})`,
  set: (em, r, a, p) => `JS.typed_set(${r}, ${lst(em, a, p)})`,
  push: (em, r, a, p, n, stmt) => (stmt && a.length === 1 && !ts.isSpreadElement(a[0]) ? `${r}.append(${em.E(a[0], p)})` : `JS.push(${r}, ${spreadOrList(em, a, p)})`),
  pop: (em, r) => `JS.pop(${r})`,
  shift: (em, r) => `JS.shift(${r})`,
  unshift: (em, r, a, p) => `JS.unshift(${r}, ${spreadOrList(em, a, p)})`,
  slice: (em, r, a, p) => `JS.slice(${r}${a.length ? ', ' + lst(em, a, p) : ''})`,
  splice: (em, r, a, p) => `JS.splice(${r}, ${a1(em, a, p, 0)}${a.length > 1 ? ', ' + em.E(a[1], p) : ''}${a.length > 2 ? `, [${a.slice(2).map((x) => em.E(x, p)).join(', ')}]` : ''})`,
  concat: (em, r, a, p) => `JS.concat(${r}, [${lst(em, a, p)}])`,
  indexOf: (em, r, a, p) => `JS.index_of(${r}, ${lst(em, a, p)})`,
  lastIndexOf: (em, r, a, p) => `JS.last_index_of(${r}, ${a1(em, a, p)})`,
  includes: (em, r, a, p) => `JS.includes(${r}, ${lst(em, a, p)})`,
  join: (em, r, a, p) => `JS.join(${r}${a.length ? ', ' + em.E(a[0], p) : ''})`,
  reverse: (em, r) => `JS.reverse(${r})`,
  map: (em, r, a, p) => `JS.map(${r}, ${cb(em, a, p)})`,
  filter: (em, r, a, p) => `JS.filter(${r}, ${cb(em, a, p)})`,
  forEach: (em, r, a, p) => `JS.for_each(${r}, ${cb(em, a, p)})`,
  find: (em, r, a, p) => `JS.find(${r}, ${cb(em, a, p)})`,
  findLast: (em, r, a, p) => `JS.find_last(${r}, ${cb(em, a, p)})`,
  findIndex: (em, r, a, p) => `JS.find_index(${r}, ${cb(em, a, p)})`,
  findLastIndex: (em, r, a, p) => `JS.find_last_index(${r}, ${cb(em, a, p)})`,
  some: (em, r, a, p) => `JS.some(${r}, ${cb(em, a, p)})`,
  every: (em, r, a, p) => `JS.every(${r}, ${cb(em, a, p)})`,
  reduce: (em, r, a, p) => `JS.reduce(${r}, ${cb(em, a, p)}${a.length > 1 ? `, ${em.E(a[1], p)}, true` : ''})`,
  sort: (em, r, a, p) => `JS.sort(${r}${a.length ? ', ' + cb(em, a, p) : ''})`,
  flat: (em, r, a, p) => `JS.flat(${r}${a.length ? ', ' + em.E(a[0], p) : ''})`,
  flatMap: (em, r, a, p) => `JS.flat_map(${r}, ${cb(em, a, p)})`,
  fill: (em, r, a, p) => `JS.fill(${r}, ${lst(em, a, p)})`,
  at: (em, r, a, p) => `JS.at(${r}, ${a1(em, a, p)})`,
  keys: (em, r) => `JS.keys(${r}).map(func(k): return float(k))`,
  entries: (em, r) => `JS.map(${r}, func(v, i): return [i, v])`,
  values: (em, r) => r,
  toString: (em, r) => `JS.str_(${r})`,
};
const STRING_METHODS = {
  toUpperCase: (em, r) => `${r}.to_upper()`,
  toLowerCase: (em, r) => `${r}.to_lower()`,
  trim: (em, r) => `${r}.strip_edges()`,
  trimStart: (em, r) => `${r}.strip_edges(true, false)`,
  trimEnd: (em, r) => `${r}.strip_edges(false, true)`,
  includes: (em, r, a, p) => `JS.includes(${r}, ${lst(em, a, p)})`,
  startsWith: (em, r, a, p) => (a.length > 1 ? `JS.starts_with(${r}, ${lst(em, a, p)})` : `${r}.begins_with(${em.S_(a[0], p)})`),
  endsWith: (em, r, a, p) => (a.length > 1 ? `JS.ends_with(${r}, ${lst(em, a, p)})` : `${r}.ends_with(${em.S_(a[0], p)})`),
  indexOf: (em, r, a, p) => `JS.index_of(${r}, ${lst(em, a, p)})`,
  lastIndexOf: (em, r, a, p) => `JS.last_index_of(${r}, ${a1(em, a, p)})`,
  slice: (em, r, a, p) => `JS.s_slice(${r}${a.length ? ', ' + lst(em, a, p) : ''})`,
  substring: (em, r, a, p) => `JS.substring(${r}${a.length ? ', ' + lst(em, a, p) : ''})`,
  substr: (em, r, a, p) => `JS.substr_(${r}, ${lst(em, a, p)})`,
  split: (em, r, a, p) => `JS.split(${r}${a.length ? ', ' + lst(em, a, p) : ''})`,
  replace: (em, r, a, p) => `JS.replace(${r}, ${em.E(a[0], p)}, ${em.E(a[1], p)})`,
  replaceAll: (em, r, a, p) => `JS.replace_all(${r}, ${em.E(a[0], p)}, ${em.E(a[1], p)})`,
  padStart: (em, r, a, p) => `JS.pad_start(${r}, ${lst(em, a, p)})`,
  padEnd: (em, r, a, p) => `JS.pad_end(${r}, ${lst(em, a, p)})`,
  repeat: (em, r, a, p) => `JS.repeat(${r}, ${a1(em, a, p)})`,
  charAt: (em, r, a, p) => `JS.char_at(${r}, ${a.length ? em.E(a[0], p) : '0.0'})`,
  charCodeAt: (em, r, a, p) => `JS.char_code_at(${r}${a.length ? ', ' + em.E(a[0], p) : ''})`,
  codePointAt: (em, r, a, p) => `JS.char_code_at(${r}${a.length ? ', ' + em.E(a[0], p) : ''})`,
  match: (em, r, a, p) => `JS.match_(${r}, ${a1(em, a, p)})`,
  matchAll: (em, r, a, p) => `JS.match_all(${r}, ${a1(em, a, p)})`,
  search: (em, r, a, p) => `JS.search(${r}, ${a1(em, a, p)})`,
  localeCompare: (em, r, a, p) => `JS.locale_compare(${r}, ${a1(em, a, p)})`,
  at: (em, r, a, p) => `JS.at(${r}, ${a1(em, a, p)})`,
  concat: (em, r, a, p) => `(${[r, ...a.map((x) => em.S_(x, p))].join(' + ')})`,
  toString: (em, r) => r,
  normalize: (em, r) => r,
};
const NUMBER_METHODS = {
  toFixed: (em, r, a, p) => `JS.to_fixed(${r}${a.length ? ', ' + em.E(a[0], p) : ''})`,
  toString: (em, r, a, p) => (a.length ? `JS.to_radix(${r}, ${em.E(a[0], p)})` : `JS.num_str(${r})`),
  toLocaleString: (em, r, a, p) => `JS.to_locale(${r}${a.length ? ', ' + lst(em, a, p) : ''})`,
  toPrecision: (em, r, a, p) => `JS.to_precision(${r}, ${a1(em, a, p)})`,
};
const SET_METHODS = {
  has: (em, r, a, p) => `${r}.has(${a1(em, a, p)})`,
  add: (em, r, a, p) => `${r}.add(${a1(em, a, p)})`,
  delete: (em, r, a, p) => `${r}.del(${a1(em, a, p)})`,
  clear: (em, r) => `${r}.clear()`,
  values: (em, r) => `${r}.values()`,
  keys: (em, r) => `${r}.values()`,
  entries: (em, r) => `${r}.entries()`,
  forEach: (em, r, a, p) => `${r}.for_each(${cb(em, a, p)})`,
};
const MAP_METHODS = {
  has: (em, r, a, p) => `${r}.has(${a1(em, a, p)})`,
  get: (em, r, a, p) => `${r}.get_(${a1(em, a, p)})`,
  set: (em, r, a, p) => `${r}.set_(${lst(em, a, p)})`,
  delete: (em, r, a, p) => `${r}.del(${a1(em, a, p)})`,
  clear: (em, r) => `${r}.clear()`,
  keys: (em, r) => `${r}.keys()`,
  values: (em, r) => `${r}.values()`,
  entries: (em, r) => `${r}.entries()`,
  forEach: (em, r, a, p) => `${r}.for_each(${cb(em, a, p)})`,
};
const REGEXP_METHODS = {
  test: (em, r, a, p) => `JS.re_test(${r}, ${a1(em, a, p)})`,
  exec: (em, r, a, p) => `JS.re_exec(${r}, ${a1(em, a, p)})`,
};

// ------------------------------------------------------------------ main

const files = process.argv.slice(2).map((f) => path.resolve(REPO, f));
let written = 0;
for (const f of files) {
  const sf = program.getSourceFile(f);
  if (!sf) {
    console.error('not in the program: ' + f);
    continue;
  }
  const em = new ModuleEmitter(sf);
  let text;
  try {
    text = em.emit();
  } catch (e) {
    problems.push(`${path.relative(REPO, f)}: CRASH ${e.stack.split('\n').slice(0, 4).join(' | ')}`);
    continue;
  }
  const o = outFile(f);
  fs.mkdirSync(path.dirname(o), { recursive: true });
  fs.writeFileSync(o, text);
  written++;
}
console.log(`gdport: ${written} module(s) written to ${path.relative(REPO, OUT)}`);
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log('  ' + p);
  process.exitCode = 1;
}
