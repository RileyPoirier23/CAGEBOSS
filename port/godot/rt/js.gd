## JavaScript semantics for code translated from TypeScript (tools/gdport).
## Every number is a float (as in JavaScript); objects are Dictionaries; arrays are Arrays.
class_name JS

# ------------------------------------------------------------------ values

static func truthy(v) -> bool:
	match typeof(v):
		TYPE_NIL: return false
		TYPE_BOOL: return v
		TYPE_FLOAT: return v != 0.0 and not is_nan(v)
		TYPE_INT: return v != 0
		TYPE_STRING, TYPE_STRING_NAME: return v != ""
	return true

static func type_of(v) -> String:
	match typeof(v):
		TYPE_NIL: return "undefined"
		TYPE_BOOL: return "boolean"
		TYPE_FLOAT, TYPE_INT: return "number"
		TYPE_STRING, TYPE_STRING_NAME: return "string"
		TYPE_CALLABLE: return "function"
	return "object"

static func eq(a, b) -> bool:
	var ta = typeof(a)
	var tb = typeof(b)
	if ta == tb:
		if ta == TYPE_DICTIONARY or ta == TYPE_ARRAY or ta == TYPE_OBJECT: return is_same(a, b)
		if ta == TYPE_FLOAT: return a == b and not is_nan(a)
		return a == b
	if (ta == TYPE_FLOAT or ta == TYPE_INT) and (tb == TYPE_FLOAT or tb == TYPE_INT): return float(a) == float(b)
	if (ta == TYPE_STRING or ta == TYPE_STRING_NAME) and (tb == TYPE_STRING or tb == TYPE_STRING_NAME): return String(a) == String(b)
	return false

static func neq(a, b) -> bool:
	return not eq(a, b)

## a ?? b with b already evaluated
static func nc(a, b):
	return b if a == null else a

static func nc_lazy(a, f: Callable):
	return f.call() if a == null else a

static func or_lazy(a, f: Callable):
	return a if truthy(a) else f.call()

static func and_lazy(a, f: Callable):
	return f.call() if truthy(a) else a

# ------------------------------------------------------------------ numbers

static func num(v) -> float:
	match typeof(v):
		TYPE_NIL: return NAN
		TYPE_BOOL: return 1.0 if v else 0.0
		TYPE_FLOAT: return v
		TYPE_INT: return float(v)
		TYPE_STRING, TYPE_STRING_NAME:
			var s = String(v).strip_edges()
			if s == "": return 0.0
			if s.is_valid_float() or s.is_valid_int(): return s.to_float()
			if s.begins_with("0x") or s.begins_with("0X"): return float(s.hex_to_int())
			return NAN
	return NAN

static func round_(x: float) -> float:
	return floor(x + 0.5)

static func trunc(x: float) -> float:
	return floor(x) if x >= 0.0 else ceil(x)

static func sign_(x: float) -> float:
	if is_nan(x): return NAN
	return 1.0 if x > 0.0 else (-1.0 if x < 0.0 else x)

static func hypot(a: float, b: float, c = null) -> float:
	if c == null: return sqrt(a * a + b * b)
	return sqrt(a * a + b * b + float(c) * float(c))

static func log10(x: float) -> float:
	return log(x) / log(10.0)

static func max_(args: Array) -> float:
	var m = -INF
	for a in args:
		var f = num(a)
		if is_nan(f): return NAN
		if f > m: m = f
	return m

static func min_(args: Array) -> float:
	var m = INF
	for a in args:
		var f = num(a)
		if is_nan(f): return NAN
		if f < m: m = f
	return m

static func _wrap32(i: int) -> int:
	i &= 0xFFFFFFFF
	return i - 0x100000000 if i >= 0x80000000 else i

static func to_int32(v) -> int:
	if typeof(v) == TYPE_INT: return _wrap32(v)
	var f = num(v)
	if is_nan(f) or is_inf(f): return 0
	var i = int(trunc(f)) & 0xFFFFFFFF
	return i - 0x100000000 if i >= 0x80000000 else i

static func to_uint32(v) -> int:
	return to_int32(v) & 0xFFFFFFFF

static func bor(a, b) -> float: return float(to_int32(to_int32(a) | to_int32(b)))
static func band(a, b) -> float: return float(to_int32(to_int32(a) & to_int32(b)))
static func bxor(a, b) -> float: return float(to_int32(to_int32(a) ^ to_int32(b)))
static func bnot(a) -> float: return float(to_int32(~to_int32(a)))
static func shl(a, b) -> float: return float(to_int32(to_int32(a) << (to_uint32(b) & 31)))
static func shr(a, b) -> float: return float(to_int32(a) >> (to_uint32(b) & 31))
static func ushr(a, b) -> float: return float(to_uint32(a) >> (to_uint32(b) & 31))

static func imul(a, b) -> float:
	return float(_wrap32(to_int32(a) * to_int32(b)))

static func pow_(a: float, b: float) -> float:
	return pow(a, b)

static func mod(a, b) -> float:
	return fmod(num(a), num(b))

## JavaScript Number#toString()
static func num_str(x: float) -> String:
	if is_nan(x): return "NaN"
	if is_inf(x): return "Infinity" if x > 0 else "-Infinity"
	if x == floor(x) and absf(x) < 1e21: return str(int(x))
	if absf(x) < 1e-6 or absf(x) >= 1e21:
		return _num_exp(x)
	for d in range(1, 21):
		var s = String.num(x, d)
		if s.to_float() == x: return s
	return String.num(x, 20)

static func _num_exp(x: float) -> String:
	var e = int(floor(log(absf(x)) / log(10.0)))
	var m = x / pow(10.0, e)
	if absf(m) >= 10.0:
		m /= 10.0
		e += 1
	var ms = ""
	for d in range(0, 20):
		ms = String.num(m, d)
		if (ms.to_float() * pow(10.0, e)) == x: break
	return ms + "e" + ("+" if e >= 0 else "-") + str(absi(e))

static func to_fixed(x, digits = 0.0) -> String:
	var d = int(num(digits))
	var f = num(x)
	if is_nan(f): return "NaN"
	var s: String = ("%." + str(d) + "f") % f
	if s.begins_with("-") and s.to_float() == 0.0: s = s.substr(1)
	return s

static func to_radix(x, radix) -> String:
	var r = int(num(radix))
	var f = num(x)
	if r == 10: return num_str(f)
	var n = int(trunc(f))
	var neg = n < 0
	n = absi(n)
	var digits = "0123456789abcdefghijklmnopqrstuvwxyz"
	var out = ""
	if n == 0: out = "0"
	while n > 0:
		out = digits[n % r] + out
		n = n / r
	return ("-" + out) if neg else out

## en-US Number#toLocaleString(): grouping commas, up to 3 decimals
static func to_locale(x, _locale = null, opts = null) -> String:
	var f = num(x)
	var maxd = 3
	var mind = 0
	if opts is Dictionary:
		if opts.has("maximumFractionDigits"): maxd = int(opts["maximumFractionDigits"])
		if opts.has("minimumFractionDigits"): mind = int(opts["minimumFractionDigits"])
	var neg = f < 0.0
	var s = to_fixed(absf(f), maxd)
	var parts = s.split(".")
	var ip: String = parts[0]
	var fp: String = parts[1] if parts.size() > 1 else ""
	while fp.length() > mind and fp.ends_with("0"): fp = fp.substr(0, fp.length() - 1)
	var grouped = ""
	var c = 0
	for i in range(ip.length() - 1, -1, -1):
		grouped = ip[i] + grouped
		c += 1
		if c % 3 == 0 and i > 0: grouped = "," + grouped
	return ("-" if neg and (grouped != "0" or fp != "") else "") + grouped + ("." + fp if fp != "" else "")

static func parse_int(s, radix = null) -> float:
	var t = str_(s).strip_edges()
	var r = 10 if radix == null else int(num(radix))
	var neg = false
	if t.begins_with("-"):
		neg = true
		t = t.substr(1)
	elif t.begins_with("+"):
		t = t.substr(1)
	if (r == 16 or radix == null) and (t.begins_with("0x") or t.begins_with("0X")):
		r = 16
		t = t.substr(2)
	var digits = "0123456789abcdefghijklmnopqrstuvwxyz".substr(0, r)
	var out = 0.0
	var any = false
	for ch in t.to_lower():
		var d = digits.find(ch)
		if d < 0: break
		out = out * r + d
		any = true
	if not any: return NAN
	return -out if neg else out

static func parse_float(s) -> float:
	var t = str_(s).strip_edges()
	var re = _re_get("^[+-]?(Infinity|(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?)", "")
	var m = re.search(t)
	if m == null: return NAN
	var v = m.get_string()
	if v.ends_with("Infinity"): return -INF if v.begins_with("-") else INF
	return v.to_float()

static func is_finite(v) -> bool:
	if typeof(v) != TYPE_FLOAT and typeof(v) != TYPE_INT: return false
	return not is_nan(float(v)) and not is_inf(float(v))

static func is_nan_(v) -> bool:
	return is_nan(num(v))

# ------------------------------------------------------------------ strings

## JavaScript String(v) / template literal conversion
static func str_(v) -> String:
	match typeof(v):
		TYPE_NIL: return "undefined"
		TYPE_BOOL: return "true" if v else "false"
		TYPE_FLOAT: return num_str(v)
		TYPE_INT: return str(v)
		TYPE_STRING: return v
		TYPE_STRING_NAME: return String(v)
		TYPE_ARRAY:
			var parts = PackedStringArray()
			for e in v: parts.append("" if e == null else str_(e))
			return ",".join(parts)
		TYPE_DICTIONARY: return "[object Object]"
	return str(v)

## property key: numbers become their JavaScript string form
static func key(k) -> String:
	if typeof(k) == TYPE_STRING: return k
	return str_(k)

static func add(a, b):
	var ta = typeof(a)
	var tb = typeof(b)
	if ta == TYPE_STRING or tb == TYPE_STRING or ta == TYPE_ARRAY or tb == TYPE_ARRAY or ta == TYPE_DICTIONARY or tb == TYPE_DICTIONARY:
		return str_(a) + str_(b)
	return num(a) + num(b)

static func s_len(s: String) -> float:
	return float(s.length())

static func char_at(s: String, i) -> String:
	var n = int(num(i))
	if n < 0 or n >= s.length(): return ""
	return s[n]

static func s_idx(s: String, i):
	var n = int(num(i))
	if n < 0 or n >= s.length(): return null
	return s[n]

static func char_code_at(s: String, i = 0.0) -> float:
	var n = int(num(i))
	if n < 0 or n >= s.length(): return NAN
	return float(s.unicode_at(n))

static func from_char_code(codes: Array) -> String:
	var out = ""
	for c in codes: out += String.chr(int(num(c)))
	return out

static func _norm_index(i, n: int, def: int) -> int:
	if i == null: return def
	var f = num(i)
	if is_nan(f): return 0
	var k = int(trunc(f)) if not is_inf(f) else (n if f > 0 else -n - 1)
	if k < 0: k = maxi(n + k, 0)
	return mini(k, n)

static func s_slice(s: String, a = null, b = null) -> String:
	var n = s.length()
	var i = _norm_index(a, n, 0)
	var j = _norm_index(b, n, n)
	if j <= i: return ""
	return s.substr(i, j - i)

static func substring(s: String, a = null, b = null) -> String:
	var n = s.length()
	var i = clampi(0 if a == null or is_nan(num(a)) else int(num(a)), 0, n)
	var j = clampi(n if b == null else (0 if is_nan(num(b)) else int(num(b))), 0, n)
	if i > j:
		var t = i
		i = j
		j = t
	return s.substr(i, j - i)

static func substr_(s: String, a, l = null) -> String:
	var n = s.length()
	var i = _norm_index(a, n, 0)
	var ln = n - i if l == null else int(num(l))
	if ln <= 0: return ""
	return s.substr(i, ln)

static func starts_with(s: String, x, pos = 0.0) -> bool:
	return s.substr(clampi(int(num(pos)), 0, s.length())).begins_with(str_(x))

static func ends_with(s: String, x, end_ = null) -> bool:
	var e = s.length() if end_ == null else clampi(int(num(end_)), 0, s.length())
	return s.substr(0, e).ends_with(str_(x))

static func index_of(s, x, from = null) -> float:
	if s is Array:
		var st = 0 if from == null else _norm_index(from, s.size(), 0)
		for i in range(st, s.size()):
			if eq(s[i], x): return float(i)
		return -1.0
	return float(String(s).find(str_(x), 0 if from == null else int(num(from))))

static func last_index_of(s, x) -> float:
	if s is Array:
		for i in range(s.size() - 1, -1, -1):
			if eq(s[i], x): return float(i)
		return -1.0
	return float(String(s).rfind(str_(x)))

static func includes(s, x, from = null) -> bool:
	if s is Array:
		if typeof(x) == TYPE_FLOAT and is_nan(x):
			for e in s:
				if typeof(e) == TYPE_FLOAT and is_nan(e): return true
			return false
		return index_of(s, x, from) >= 0
	if s is JSSet: return s.has(x)
	return String(s).find(str_(x), 0 if from == null else int(num(from))) >= 0

static func pad_start(s: String, n, fill = " ") -> String:
	var target = int(num(n))
	var f = str_(fill)
	if s.length() >= target or f == "": return s
	var pad = ""
	while pad.length() < target - s.length(): pad += f
	return pad.substr(0, target - s.length()) + s

static func pad_end(s: String, n, fill = " ") -> String:
	var target = int(num(n))
	var f = str_(fill)
	if s.length() >= target or f == "": return s
	var pad = ""
	while pad.length() < target - s.length(): pad += f
	return s + pad.substr(0, target - s.length())

static func repeat(s: String, n) -> String:
	return s.repeat(int(num(n)))

static func trim(s: String) -> String: return s.strip_edges()
static func trim_start(s: String) -> String: return s.strip_edges(true, false)
static func trim_end(s: String) -> String: return s.strip_edges(false, true)

static func split(s: String, sep = null, limit = null) -> Array:
	var out: Array = []
	if sep == null:
		out = [s]
	elif sep is RegEx:
		var pos = 0
		for m in sep.search_all(s):
			if m.get_end() == m.get_start() and m.get_start() == 0: continue
			out.append(s.substr(pos, m.get_start() - pos))
			for g in range(1, m.get_group_count() + 1): out.append(m.get_string(g) if m.get_start(g) >= 0 else null)
			pos = m.get_end()
		out.append(s.substr(pos))
	elif str_(sep) == "":
		for ch in s: out.append(ch)
	else:
		for p in s.split(str_(sep)): out.append(p)
	if limit != null: out = out.slice(0, int(num(limit)))
	return out

## ICU root collation (what String#localeCompare uses), for ASCII: punctuation < digits < letters,
## letters case-insensitive first, then lowercase before uppercase.
const _COLL_PUNCT = "\t\n\r _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"

static func _coll_primary(c: int) -> int:
	if c >= 48 and c <= 57: return 100 + c
	if c >= 97 and c <= 122: return 200 + c - 97
	if c >= 65 and c <= 90: return 200 + c - 65
	var i = _COLL_PUNCT.find(char(c))
	if i >= 0: return i
	return 1000 + c

static func locale_compare(a: String, b: String) -> float:
	var n = mini(a.length(), b.length())
	for i in n:
		var pa = _coll_primary(a.unicode_at(i))
		var pb = _coll_primary(b.unicode_at(i))
		if pa != pb: return -1.0 if pa < pb else 1.0
	if a.length() != b.length(): return -1.0 if a.length() < b.length() else 1.0
	for i in n:
		var ca = a.unicode_at(i)
		var cb = b.unicode_at(i)
		if ca != cb:
			var ua = ca >= 65 and ca <= 90
			var ub = cb >= 65 and cb <= 90
			if ua != ub: return 1.0 if ua else -1.0
	return 0.0

static func to_upper(s: String) -> String: return s.to_upper()
static func to_lower(s: String) -> String: return s.to_lower()

# ------------------------------------------------------------------ regular expressions

static var _re_cache := {}

static func _re_get(pattern: String, flags: String) -> RegEx:
	var k = flags + "/" + pattern
	if _re_cache.has(k): return _re_cache[k]
	var p = pattern
	var prefix = ""
	if flags.contains("i"): prefix += "i"
	if flags.contains("m"): prefix += "m"
	if flags.contains("s"): prefix += "s"
	if prefix != "": p = "(?" + prefix + ")" + p
	var re = RegEx.new()
	var err = re.compile(p)
	if err != OK: push_error("bad regex: " + pattern)
	re.set_meta("global", flags.contains("g"))
	re.set_meta("source", pattern)
	_re_cache[k] = re
	return re

static func re(pattern: String, flags: String = "") -> RegEx:
	return _re_get(pattern, flags)

static func re_test(r: RegEx, s) -> bool:
	return r.search(str_(s)) != null

static func _match_arr(m: RegExMatch) -> Array:
	var out: Array = [m.get_string()]
	for g in range(1, m.get_group_count() + 1): out.append(m.get_string(g) if m.get_start(g) >= 0 else null)
	return out

## String#match
static func match_(s, r) -> Variant:
	var t = str_(s)
	if not (r is RegEx): r = _re_get(_re_escape(str_(r)), "")
	if r.get_meta("global", false):
		var all = r.search_all(t)
		if all.is_empty(): return null
		var out: Array = []
		for m in all: out.append(m.get_string())
		return out
	var m: RegExMatch = r.search(t)
	if m == null: return null
	var arr = _match_arr(m)
	return arr

## RegExp#exec (no lastIndex state: the first match)
static func re_exec(r: RegEx, s) -> Variant:
	var m = r.search(str_(s))
	return null if m == null else _match_arr(m)

static func _re_escape(s: String) -> String:
	var out = ""
	for ch in s:
		if "\\^$.*+?()[]{}|/-".contains(ch): out += "\\"
		out += ch
	return out

static func _expand(rep: String, m: RegExMatch) -> String:
	var out = ""
	var i = 0
	while i < rep.length():
		var ch = rep[i]
		if ch == "$" and i + 1 < rep.length():
			var nx = rep[i + 1]
			if nx == "$":
				out += "$"
				i += 2
				continue
			if nx == "&":
				out += m.get_string()
				i += 2
				continue
			if nx.is_valid_int():
				var gi = int(nx)
				if i + 2 < rep.length() and rep[i + 2].is_valid_int() and int(rep.substr(i + 1, 2)) <= m.get_group_count():
					gi = int(rep.substr(i + 1, 2))
					i += 1
				if gi <= m.get_group_count():
					out += m.get_string(gi) if m.get_start(gi) >= 0 else ""
					i += 2
					continue
		out += ch
		i += 1
	return out

static func replace(s, pat, rep, all := false) -> String:
	var t = str_(s)
	if pat is RegEx:
		var global: bool = all or pat.get_meta("global", false)
		var out = ""
		var pos = 0
		var matches = pat.search_all(t) if global else ([pat.search(t)] if pat.search(t) != null else [])
		for m in matches:
			out += t.substr(pos, m.get_start() - pos)
			if rep is Callable:
				var args = _match_arr(m)
				args.append(float(m.get_start()))
				args.append(t)
				out += str_(call_(rep, args))
			else:
				out += _expand(str_(rep), m)
			pos = m.get_end()
		return out + t.substr(pos)
	var p = str_(pat)
	if all:
		if rep is Callable:
			var parts = t.split(p)
			var out2 = parts[0]
			var at = parts[0].length()
			for i in range(1, parts.size()):
				out2 += str_(call_(rep, [p, float(at), t])) + parts[i]
				at += p.length() + parts[i].length()
			return out2
		return t.replace(p, str_(rep))
	var idx = t.find(p)
	if idx < 0: return t
	var r = str_(call_(rep, [p, float(idx), t])) if rep is Callable else str_(rep).replace("$&", p)
	return t.substr(0, idx) + r + t.substr(idx + p.length())

static func replace_all(s, pat, rep) -> String:
	return replace(s, pat, rep, true)

static func search(s, r: RegEx) -> float:
	var m = r.search(str_(s))
	return -1.0 if m == null else float(m.get_start())

# ------------------------------------------------------------------ calling

## call a callback the JavaScript way: extra arguments are dropped, missing ones are null
static func call_(f, args: Array = []):
	if not (f is Callable): return null
	var c: Callable = f
	var n = c.get_argument_count()
	if n < args.size(): return c.callv(args.slice(0, n))
	if n > args.size():
		var a = args.duplicate()
		while a.size() < n: a.append(null)
		return c.callv(a)
	return c.callv(args)

# ------------------------------------------------------------------ objects

static func g(o, k):
	match typeof(o):
		TYPE_DICTIONARY: return o.get(k)
		TYPE_OBJECT:
			if o == null: return null
			return o.get(k)
		TYPE_ARRAY:
			if k == "length": return float(o.size())
			var i = int(num(k)) if str_(k).is_valid_int() else -1
			return o[i] if i >= 0 and i < o.size() else null
		TYPE_STRING:
			if k == "length": return float(o.length())
	return null

static func s(o, k, v):
	if o is Dictionary: o[k] = v
	elif o is Array:
		if k == "length": o.resize(int(num(v)))
		else: set_idx(o, k, v)
	elif o is Object: o.set(k, v)
	return v

## a?.b
static func og(o, k):
	if o == null: return null
	return g(o, k)

## a[i] read (out of range = undefined)
static func ai(a: Array, i):
	var n = int(num(i))
	if n < 0 or n >= a.size() or is_nan(num(i)): return null
	return a[n]

static func idx(o, i):
	match typeof(o):
		TYPE_ARRAY: return ai(o, i)
		TYPE_STRING: return s_idx(o, i)
		TYPE_DICTIONARY: return o.get(key(i))
		TYPE_OBJECT:
			if o == null: return null
			if o is JSMap: return o.get_(i)
			return o.get(key(i))
	return null

static func set_idx(o, i, v):
	if o is Array:
		var n = int(num(i))
		if n >= o.size(): o.resize(n + 1)
		o[n] = v
	elif o is Dictionary:
		o[key(i)] = v
	elif o is Object:
		o.set(key(i), v)
	return v

static func has(o, k) -> bool:
	if o is Dictionary: return o.has(key(k))
	if o is Array: return int(num(k)) >= 0 and int(num(k)) < o.size()
	if o is Object and o != null: return key(k) in o
	return false

static func keys(o) -> Array:
	if o is Dictionary:
		var out: Array = []
		var nums: Array = []
		for k in o.keys():
			var ks = str_(k)
			if ks.is_valid_int() and not ks.begins_with("-") and (ks == "0" or not ks.begins_with("0")): nums.append(ks)
			else: out.append(ks)
		if nums.is_empty(): return out
		nums.sort_custom(func(a, b): return int(a) < int(b))
		return nums + out
	if o is Array:
		var r: Array = []
		for i in o.size(): r.append(str(i))
		return r
	if o is String:
		var r2: Array = []
		for i in o.length(): r2.append(str(i))
		return r2
	return []

static func values(o) -> Array:
	if o is Dictionary:
		var out: Array = []
		for k in keys(o): out.append(o[k] if o.has(k) else o.get(float(k)))
		return out
	if o is Array: return o.duplicate()
	return []

static func entries(o) -> Array:
	var out: Array = []
	if o is Dictionary:
		for k in keys(o): out.append([k, o[k] if o.has(k) else null])
	elif o is Array:
		for i in o.size(): out.append([str(i), o[i]])
	return out

static func from_entries(arr) -> Dictionary:
	var d = {}
	for e in iter(arr): d[key(e[0])] = e[1]
	return d

static func assign(target, sources: Array):
	for src in sources:
		if src == null: continue
		if src is Dictionary:
			for k in src: target[k] = src[k]
		elif src is Array:
			for i in src.size(): target[str(i)] = src[i]
	return target

## {...a, ...b}
static func spread_obj(parts: Array) -> Dictionary:
	var d = {}
	for p in parts:
		if p == null: continue
		if p is Dictionary:
			for k in p: d[k] = p[k]
		elif p is Array:
			for i in p.size(): d[str(i)] = p[i]
		elif p is String:
			for i in p.length(): d[str(i)] = p[i]
	return d

static func del(o, k) -> bool:
	if o is Dictionary: return o.erase(key(k))
	return true

static func is_array(v) -> bool:
	return v is Array

## deep copy (JSON round trip semantics)
static func clone(v):
	if v is Dictionary or v is Array: return v.duplicate(true)
	return v

# ------------------------------------------------------------------ arrays

static func iter(v) -> Array:
	if v is Array: return v
	if v == null: return []
	if v is JSSet: return v.values()
	if v is JSMap: return v.entries()
	if v is String:
		var out: Array = []
		for ch in v: out.append(ch)
		return out
	if v is Dictionary: return values(v)
	return []

static func len_(v) -> float:
	if v is Array: return float(v.size())
	if v is String: return float(v.length())
	return 0.0

static func push(a: Array, items: Array) -> float:
	a.append_array(items)
	return float(a.size())

static func unshift(a: Array, items: Array) -> float:
	for i in range(items.size() - 1, -1, -1): a.push_front(items[i])
	return float(a.size())

static func pop(a: Array):
	return null if a.is_empty() else a.pop_back()

static func shift(a: Array):
	return null if a.is_empty() else a.pop_front()

static func slice(a, s = null, e = null):
	if a is String: return s_slice(a, s, e)
	var n: int = a.size()
	var i = _norm_index(s, n, 0)
	var j = _norm_index(e, n, n)
	if j <= i: return []
	return a.slice(i, j)

static func splice(a: Array, start, count = null, items: Array = []) -> Array:
	var n = a.size()
	var i = _norm_index(start, n, 0)
	var c = n - i if count == null else clampi(int(num(count)), 0, n - i)
	var removed = a.slice(i, i + c)
	for _k in c: a.remove_at(i)
	for k in items.size(): a.insert(i + k, items[k])
	return removed

static func concat(a: Array, parts: Array) -> Array:
	var out = a.duplicate()
	for p in parts:
		if p is Array: out.append_array(p)
		else: out.append(p)
	return out

## [...a, b, ...c]: parts are [is_spread, value]
static func arr_spread(parts: Array) -> Array:
	var out: Array = []
	for p in parts:
		if p[0]: out.append_array(iter(p[1]))
		else: out.append(p[1])
	return out

static func join(a: Array, sep = ",") -> String:
	var parts = PackedStringArray()
	for e in a: parts.append("" if e == null else str_(e))
	return (str_(sep) if sep != null else ",").join(parts)

static func reverse(a: Array) -> Array:
	a.reverse()
	return a

static func fill(a: Array, v, s = null, e = null) -> Array:
	var n = a.size()
	for i in range(_norm_index(s, n, 0), _norm_index(e, n, n)): a[i] = v
	return a

static func array_new(n = 0.0) -> Array:
	var a: Array = []
	a.resize(int(num(n)))
	return a

static func array_from(src, f = null) -> Array:
	var items: Array = []
	if src is Dictionary and src.has("length"):
		items.resize(int(num(src["length"])))
	else:
		items = iter(src).duplicate()
	if f == null: return items
	var out: Array = []
	for i in items.size(): out.append(call_(f, [items[i], float(i)]))
	return out

static func map(a: Array, f) -> Array:
	var out: Array = []
	out.resize(a.size())
	for i in a.size(): out[i] = call_(f, [a[i], float(i), a])
	return out

static func filter(a: Array, f) -> Array:
	var out: Array = []
	for i in a.size():
		if truthy(call_(f, [a[i], float(i), a])): out.append(a[i])
	return out

static func for_each(a, f) -> void:
	var arr = iter(a)
	for i in arr.size(): call_(f, [arr[i], float(i), arr])

static func find(a: Array, f):
	for i in a.size():
		if truthy(call_(f, [a[i], float(i), a])): return a[i]
	return null

static func find_last(a: Array, f):
	for i in range(a.size() - 1, -1, -1):
		if truthy(call_(f, [a[i], float(i), a])): return a[i]
	return null

static func find_index(a: Array, f) -> float:
	for i in a.size():
		if truthy(call_(f, [a[i], float(i), a])): return float(i)
	return -1.0

static func find_last_index(a: Array, f) -> float:
	for i in range(a.size() - 1, -1, -1):
		if truthy(call_(f, [a[i], float(i), a])): return float(i)
	return -1.0

static func some(a: Array, f) -> bool:
	for i in a.size():
		if truthy(call_(f, [a[i], float(i), a])): return true
	return false

static func every(a: Array, f) -> bool:
	for i in a.size():
		if not truthy(call_(f, [a[i], float(i), a])): return false
	return true

static func reduce(a: Array, f, init = null, has_init := false):
	var i = 0
	var acc = init
	if not has_init:
		if a.is_empty():
			push_error("reduce of empty array with no initial value")
			return null
		acc = a[0]
		i = 1
	while i < a.size():
		acc = call_(f, [acc, a[i], float(i), a])
		i += 1
	return acc

static func flat(a: Array, depth = 1.0) -> Array:
	var out: Array = []
	var d = int(num(depth))
	for e in a:
		if e is Array and d > 0: out.append_array(flat(e, d - 1))
		else: out.append(e)
	return out

static func flat_map(a: Array, f) -> Array:
	var out: Array = []
	for i in a.size():
		var r = call_(f, [a[i], float(i), a])
		if r is Array: out.append_array(r)
		else: out.append(r)
	return out

static func at(a, i):
	var n: int = a.size() if a is Array else a.length()
	var k = int(num(i))
	if k < 0: k += n
	if k < 0 or k >= n: return null
	return a[k]

## Array#sort: stable merge sort; no comparator = compare as strings
static func sort(a: Array, cmp = null) -> Array:
	var n = a.size()
	if n < 2: return a
	var src = a.duplicate()
	var dst: Array = []
	dst.resize(n)
	var width = 1
	while width < n:
		var lo = 0
		while lo < n:
			var mid = mini(lo + width, n)
			var hi = mini(lo + 2 * width, n)
			var i = lo
			var j = mid
			var k = lo
			while i < mid and j < hi:
				if _sort_gt(src[i], src[j], cmp):
					dst[k] = src[j]
					j += 1
				else:
					dst[k] = src[i]
					i += 1
				k += 1
			while i < mid:
				dst[k] = src[i]
				i += 1
				k += 1
			while j < hi:
				dst[k] = src[j]
				j += 1
				k += 1
			lo += 2 * width
		var t = src
		src = dst
		dst = t
		width *= 2
	for x in n: a[x] = src[x]
	return a

static func _sort_gt(x, y, cmp) -> bool:
	if x == null and y != null: return true
	if y == null: return false
	if cmp == null: return str_(x) > str_(y)
	var r = num(call_(cmp, [x, y]))
	return r > 0.0

# ------------------------------------------------------------------ misc

static func now() -> float:
	return floor(Time.get_unix_time_from_system() * 1000.0)

static func json_stringify(v, _replacer = null, indent = null) -> String:
	var ind = ""
	if indent != null:
		ind = " ".repeat(int(num(indent))) if typeof(indent) == TYPE_FLOAT or typeof(indent) == TYPE_INT else str_(indent)
	return JSON.stringify(_json_clean(v), ind, false, true)

static func _json_clean(v):
	if v is Dictionary:
		var d = {}
		for k in v:
			var x = v[k]
			if x is Callable: continue
			if x == null and typeof(x) == TYPE_NIL:
				pass
			d[str_(k)] = _json_clean(x)
		return d
	if v is Array:
		var a: Array = []
		for e in v: a.append(_json_clean(e))
		return a
	if typeof(v) == TYPE_FLOAT and (is_nan(v) or is_inf(v)): return null
	return v

static func json_parse(s):
	return JSON.parse_string(str_(s))

static func log_(args: Array) -> void:
	var parts = PackedStringArray()
	for a in args: parts.append(str_(a) if not (a is Dictionary or a is Array) else JSON.stringify(a))
	print(" ".join(parts))

static func error(msg) -> void:
	if msg is Object and "message" in msg: msg = "%s: %s" % [msg.get_script().get_global_name() if msg.get_script() else "Error", msg.message]
	push_error(str_(msg))

static func is_integer(v) -> bool:
	if typeof(v) != TYPE_FLOAT and typeof(v) != TYPE_INT: return false
	var f = float(v)
	return not is_nan(f) and not is_inf(f) and f == floor(f)

static func to_precision(x, p) -> String:
	var f = num(x)
	if f == 0.0: return to_fixed(0.0, int(num(p)) - 1)
	var e = int(floor(log(absf(f)) / log(10.0)))
	return to_fixed(f, maxi(0, int(num(p)) - 1 - e))

## obj.method(args) when obj may be a Dictionary of functions or an Object
static func invoke(o, m: String, args: Array = []):
	if o is Dictionary and o.get(m) is Callable: return call_(o.get(m), args)
	if o is Object and o != null:
		if o.has_method(m): return call_(Callable(o, m), args)
		if o.get(m) is Callable: return call_(o.get(m), args)
	if o is String: return _string_method(o, m, args)
	if o is Array: return _array_method(o, m, args)
	if typeof(o) == TYPE_FLOAT or typeof(o) == TYPE_INT:
		match m:
			"toFixed": return to_fixed(o, args[0] if args.size() > 0 else 0.0)
			"toString": return num_str(o) if args.is_empty() else to_radix(o, args[0])
			"toLocaleString": return to_locale(o)
	push_error("JS.invoke: no method " + m + " on " + type_of(o))
	return null

static func _a(args: Array, i: int):
	return args[i] if i < args.size() else null

static func _string_method(s: String, m: String, args: Array):
	match m:
		"toUpperCase": return s.to_upper()
		"toLowerCase": return s.to_lower()
		"trim": return s.strip_edges()
		"includes": return includes(s, _a(args, 0))
		"startsWith": return starts_with(s, _a(args, 0), _a(args, 1) if args.size() > 1 else 0.0)
		"endsWith": return ends_with(s, _a(args, 0), _a(args, 1))
		"indexOf": return index_of(s, _a(args, 0), _a(args, 1))
		"slice": return s_slice(s, _a(args, 0), _a(args, 1))
		"substring": return substring(s, _a(args, 0), _a(args, 1))
		"split": return split(s, _a(args, 0), _a(args, 1))
		"replace": return replace(s, _a(args, 0), _a(args, 1))
		"replaceAll": return replace_all(s, _a(args, 0), _a(args, 1))
		"charAt": return char_at(s, _a(args, 0) if args.size() else 0.0)
		"charCodeAt": return char_code_at(s, _a(args, 0) if args.size() else 0.0)
		"padStart": return pad_start(s, _a(args, 0), _a(args, 1) if args.size() > 1 else " ")
		"padEnd": return pad_end(s, _a(args, 0), _a(args, 1) if args.size() > 1 else " ")
		"repeat": return repeat(s, _a(args, 0))
		"match": return match_(s, _a(args, 0))
		"toString": return s
		"length": return float(s.length())
	push_error("JS.invoke: string method " + m)
	return null

static func _array_method(a: Array, m: String, args: Array):
	match m:
		"push": return push(a, args)
		"pop": return pop(a)
		"shift": return shift(a)
		"slice": return slice(a, _a(args, 0), _a(args, 1))
		"map": return map(a, _a(args, 0))
		"filter": return filter(a, _a(args, 0))
		"find": return find(a, _a(args, 0))
		"some": return some(a, _a(args, 0))
		"every": return every(a, _a(args, 0))
		"includes": return includes(a, _a(args, 0))
		"indexOf": return index_of(a, _a(args, 0))
		"join": return join(a, _a(args, 0) if args.size() else ",")
		"forEach":
			for_each(a, _a(args, 0))
			return null
		"concat": return concat(a, args)
		"sort": return sort(a, _a(args, 0))
		"reverse": return reverse(a)
		"reduce": return reduce(a, _a(args, 0), _a(args, 1), args.size() > 1)
	push_error("JS.invoke: array method " + m)
	return null

# ------------------------------------------------------------------ timers

static var _timer_id := 0
static var _timers := {}

static func _tree() -> SceneTree:
	return Engine.get_main_loop() as SceneTree

static func set_timeout(f, ms = 0.0, _a = null) -> float:
	_timer_id += 1
	var id = _timer_id
	var t = _tree().create_timer(maxf(0.0, num(ms)) / 1000.0, true, false, true)
	_timers[id] = t
	t.timeout.connect(func():
		if _timers.has(id):
			_timers.erase(id)
			call_(f, []))
	return float(id)

static func set_interval(f, ms = 0.0) -> float:
	_timer_id += 1
	var id = _timer_id
	_timers[id] = true
	var loop = func(self_ref):
		pass
	_interval_tick(id, f, maxf(1.0, num(ms)))
	return float(id)

static func _interval_tick(id: int, f, ms: float) -> void:
	var t = _tree().create_timer(ms / 1000.0, true, false, true)
	t.timeout.connect(func():
		if not _timers.has(id): return
		call_(f, [])
		_interval_tick(id, f, ms))

# ------------------------------------------------------------------ microtasks / promises

static var _micro: Array = []

static func queue_microtask(f) -> void:
	_micro.append(f)

static func flush_microtasks() -> void:
	var guard = 0
	while not _micro.is_empty() and guard < 100000:
		guard += 1
		var f = _micro.pop_front()
		call_(f, [])

## await: our promises settle synchronously, so run pending callbacks and take the value
static func await_(p):
	if p is JSPromise:
		flush_microtasks()
		return p._value
	return p

## an async function's result
static func async_result(v) -> JSPromise:
	return JSPromise.resolve(v)

# ------------------------------------------------------------------ typed arrays (Uint8ClampedArray as an Array of floats)

static func u8c(n) -> Array:
	var a: Array = []
	if n is Array:
		for v in n: a.append(_clamp8(v))
		return a
	a.resize(int(num(n)))
	a.fill(0.0)
	return a

static func _clamp8(v) -> float:
	var f = num(v)
	if is_nan(f) or f <= 0.0: return 0.0
	if f >= 255.0: return 255.0
	# round half to even, like Uint8ClampedArray
	var r = floor(f)
	var d = f - r
	if d > 0.5 or (d == 0.5 and int(r) % 2 == 1): r += 1.0
	return r

static func u8c_set(a: Array, i, v) -> float:
	var k = int(num(i))
	if k < 0 or k >= a.size(): return num(v)
	a[k] = _clamp8(v)
	return num(v)

## [...].next() on a fresh key/value list: its first element, iterator-result style
static func iter_next(a) -> Dictionary:
	var arr: Array = iter(a)
	return {"value": arr[0] if arr.size() > 0 else null, "done": arr.is_empty()}

static func typed_set(a: Array, src, offset = 0.0) -> void:
	var o = int(num(offset))
	var s: Array = iter(src)
	for i in s.size():
		if o + i < a.size(): a[o + i] = s[i]

static func clear_timeout(id) -> void:
	if id == null: return
	_timers.erase(int(num(id)))

static func date(a = null) -> Dictionary:
	var ms = now() if a == null else num(a)
	return {"_ms": ms}

static func match_all(s, r: RegEx) -> Array:
	var out: Array = []
	for m in r.search_all(str_(s)): out.append(_match_arr(m))
	return out

# ------------------------------------------------------------------ localStorage (a JSON file in user://)

static var _ls = null
static var _ls_loaded := false
## localStorage: one file per key in user://storage (cloud-save friendly)
const LS_DIR := "user://storage/"

static func _ls_file(k: String) -> String:
	return LS_DIR + k.uri_encode() + ".txt"

class Storage extends RefCounted:
	var length: float:
		get: return float(JS._ls_data.size())
	func getItem(k): return JS._ls_data.get(JS.str_(k))
	func setItem(k, v) -> void:
		JS._ls_data[JS.str_(k)] = JS.str_(v)
		JS._ls_write(JS.str_(k))
	func removeItem(k) -> void:
		JS._ls_data.erase(JS.str_(k))
		DirAccess.remove_absolute(JS._ls_file(JS.str_(k)))
	func key(i): return JS.ai(JS._ls_data.keys(), i)
	func clear_() -> void:
		for k in JS._ls_data.keys(): DirAccess.remove_absolute(JS._ls_file(k))
		JS._ls_data.clear()

static func local_storage():
	if not _ls_loaded:
		_ls_loaded = true
		DirAccess.make_dir_recursive_absolute(LS_DIR)
		for fn in DirAccess.get_files_at(LS_DIR):
			if not fn.ends_with(".txt"): continue
			var f = FileAccess.open(LS_DIR + fn, FileAccess.READ)
			if f: _ls_data[fn.trim_suffix(".txt").uri_decode()] = f.get_as_text()
		_ls = JS.Storage.new()
	return _ls

static var _ls_data: Dictionary = {}

static func _ls_write(k: String) -> void:
	var f = FileAccess.open(_ls_file(k), FileAccess.WRITE)
	if f:
		f.store_string(_ls_data[k])
		f.close()