## PixiJS (v8) stand-in for the translated UI code.
## Display objects are RefCounted objects that each own a RenderingServer canvas item, so the
## scene graph, draw order, alpha and transforms behave like Pixi's while Godot does the drawing.
## Only the parts of Pixi the game uses are here.
class_name PX
extends RefCounted

## profiling (PROF=1): time in Graphics fill/stroke and per ticker listener
static var prof := false
static var prof_gfx_us := 0
static var prof_gfx_n := 0
static var prof_ticker := {}
## false once the engine is shutting down (the RenderingServer may already be gone)
static var alive := true
## the canvas item everything hangs off (set by PXHost)
static var root_ci: RID
## stage-space objects with a mask: their clip rects are refreshed every frame
static var _masked: Array = []

const UPDATE_PRIORITY = {"INTERACTION": 50.0, "HIGH": 25.0, "NORMAL": 0.0, "LOW": -25.0, "UTILITY": -50.0}

class TextureStyle:
	static var defaultOptions = {"scaleMode": "nearest"}

# ------------------------------------------------------------------ helpers

static func color(c, alpha = 1.0) -> Color:
	if c is Color: return Color(c, c.a * alpha)
	if c is String:
		var s: String = c
		if s.begins_with("rgba(") or s.begins_with("rgb("):
			var parts = s.substr(s.find("(") + 1).trim_suffix(")").split(",")
			var a = float(parts[3]) if parts.size() > 3 else 1.0
			return Color8(int(parts[0]), int(parts[1]), int(parts[2]), int(round(a * 255.0)))
		var col = Color.html(s)
		col.a *= alpha
		return col
	if c == null: return Color(0, 0, 0, alpha)
	var n = int(c)
	return Color8((n >> 16) & 255, (n >> 8) & 255, n & 255, 255) * Color(1, 1, 1, alpha)

static var _rgb_cache := {}
## an opaque 0xRRGGBB colour (cached: the UI uses a few hundred)
static func rgb(c: float) -> Color:
	var col = _rgb_cache.get(c)
	if col == null:
		var n = int(c)
		col = Color8((n >> 16) & 255, (n >> 8) & 255, n & 255, 255)
		_rgb_cache[c] = col
	return col

static func _v(p) -> Vector2:
	if p is Vector2: return p
	if p is Dictionary: return Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
	if p == null: return Vector2.ZERO
	return Vector2(p.x, p.y)

## hitArea / mask shapes: Rectangle, or any object/dictionary with contains(x, y)
static func _contains(area, p: Vector2) -> bool:
	if area is Dictionary: return JS.truthy(JS.call_(area.get("contains"), [p.x, p.y]))
	return area.contains(p.x, p.y)

# ------------------------------------------------------------------ geometry

class Point extends RefCounted:
	var _x := 0.0
	var _y := 0.0
	var _cb := Callable()
	var x: float:
		get: return _x
		set(v):
			if v != _x:
				_x = v
				if _cb.is_valid(): _cb.call()
	var y: float:
		get: return _y
		set(v):
			if v != _y:
				_y = v
				if _cb.is_valid(): _cb.call()
	func _init(ax = 0.0, ay = null) -> void:
		_x = float(ax)
		_y = float(ay) if ay != null else 0.0
	func set_(ax = 0.0, ay = null):
		var nx = float(ax)
		var ny = float(ay) if ay != null else nx
		if nx != _x or ny != _y:
			_x = nx
			_y = ny
			if _cb.is_valid(): _cb.call()
		return self
	func copyFrom(p):
		var v = PX._v(p)
		return set_(v.x, v.y)
	func clone(): return PX.Point.new(_x, _y)
	func equals(p) -> bool:
		var v = PX._v(p)
		return v.x == _x and v.y == _y
	func _vec() -> Vector2: return Vector2(_x, _y)

class Rectangle extends RefCounted:
	var x := 0.0
	var y := 0.0
	var width := 0.0
	var height := 0.0
	var left: float:
		get: return x
	var top: float:
		get: return y
	var right: float:
		get: return x + width
	var bottom: float:
		get: return y + height
	var minX: float:
		get: return x
	var minY: float:
		get: return y
	var maxX: float:
		get: return x + width
	var maxY: float:
		get: return y + height
	func _init(ax = 0.0, ay = 0.0, aw = 0.0, ah = 0.0) -> void:
		x = float(ax)
		y = float(ay)
		width = float(aw)
		height = float(ah)
	func contains(px, py) -> bool:
		if width <= 0.0 or height <= 0.0: return false
		return px >= x and px < x + width and py >= y and py < y + height
	func clone(): return PX.Rectangle.new(x, y, width, height)
	func _rect() -> Rect2: return Rect2(x, y, width, height)

static func _rect_of(r: Rect2) -> Rectangle:
	return Rectangle.new(r.position.x, r.position.y, r.size.x, r.size.y)

# ------------------------------------------------------------------ events

class EventEmitter extends RefCounted:
	var _px_ev := {}
	## JS objects take any property (the UI hangs data off display objects)
	var _px_extra := {}
	func _set(p: StringName, v) -> bool:
		_px_extra[p] = v
		return true
	func _get(p: StringName):
		return _px_extra.get(p)
	func on(ev, fn, _ctx = null):
		if not _px_ev.has(ev): _px_ev[ev] = []
		_px_ev[ev].append([fn, false])
		return self
	func once(ev, fn, _ctx = null):
		if not _px_ev.has(ev): _px_ev[ev] = []
		_px_ev[ev].append([fn, true])
		return self
	func addListener(ev, fn, ctx = null): return on(ev, fn, ctx)
	func off(ev, fn = null, _ctx = null):
		if not _px_ev.has(ev): return self
		if fn == null:
			_px_ev.erase(ev)
			return self
		var l: Array = _px_ev[ev]
		for i in range(l.size() - 1, -1, -1):
			if l[i][0] == fn:
				l.remove_at(i)
				break
		return self
	func removeListener(ev, fn = null, ctx = null): return off(ev, fn, ctx)
	func removeAllListeners(ev = null):
		if ev == null: _px_ev.clear()
		else: _px_ev.erase(ev)
		return self
	func listenerCount(ev) -> float:
		return float(_px_ev[ev].size()) if _px_ev.has(ev) else 0.0
	func listeners(ev) -> Array:
		var out := []
		if _px_ev.has(ev):
			for e in _px_ev[ev]: out.append(e[0])
		return out
	func emit(ev, a = null, b = null, c = null) -> bool:
		if not _px_ev.has(ev): return false
		var l: Array = _px_ev[ev]
		if l.is_empty(): return false
		for e in l.duplicate():
			if e[1]: l.erase(e)
			JS.call_(e[0], [a, b, c])
		return true

class FederatedEvent extends RefCounted:
	var type := ""
	var target = null
	var currentTarget = null
	var global := PX.Point.new()
	var pointerId := 1.0
	var pointerType := "mouse"
	var button := 0.0
	var buttons := 0.0
	var deltaX := 0.0
	var deltaY := 0.0
	var deltaMode := 0.0
	var isPrimary := true
	var shiftKey := false
	var ctrlKey := false
	var altKey := false
	var metaKey := false
	var defaultPrevented := false
	var propagationStopped := false
	var nativeEvent = null
	var client: PX.Point:
		get: return global
	var screen: PX.Point:
		get: return global
	var data:
		get: return self
	var x: float:
		get: return global.x
	var y: float:
		get: return global.y
	var clientX: float:
		get: return global.x
	var clientY: float:
		get: return global.y
	func stopPropagation() -> void: propagationStopped = true
	func stopImmediatePropagation() -> void: propagationStopped = true
	func preventDefault() -> void: defaultPrevented = true
	func getLocalPosition(c, _point = null, _glob = null):
		return c.toLocal(global)
	func composedPath() -> Array:
		var out := []
		var t = target
		while t != null:
			out.push_front(t)
			t = t.parent
		return out

# ------------------------------------------------------------------ display objects

class Container_ extends EventEmitter:
	var _ci: RID = RenderingServer.canvas_item_create()
	var children: Array = []
	var _parent_ref: WeakRef = null
	var parent:
		get: return _parent_ref.get_ref() if _parent_ref != null else null
	var position: PX.Point = _pt(0.0, 0.0)
	var scale: PX.Point = _pt(1.0, 1.0)
	var pivot: PX.Point = _pt(0.0, 0.0)
	var skew: PX.Point = PX.Point.new()
	func _pt(ax: float, ay: float) -> PX.Point:
		var p = PX.Point.new(ax, ay)
		p._cb = _xf
		return p
	var _rotation := 0.0
	var _alpha := 1.0
	var _visible := true
	var _tint := 0xffffff
	var label := ""
	var eventMode := "passive"
	var interactiveChildren := true
	var cursor = null
	var hitArea = null
	var _mask = null
	var zIndex := 0.0
	var sortableChildren := false
	var cullable := false
	var destroyed := false
	var _local := Transform2D.IDENTITY
	var isMask := false

	func _init(_opts = null) -> void:
		if _opts is Dictionary:
			for k in _opts:
				if k == "children":
					for ch in _opts[k]: addChild(ch)
				elif k == "x": x = _opts[k]
				elif k == "y": y = _opts[k]
				elif k in self: set(k, _opts[k])

	func _notification(what: int) -> void:
		if what == NOTIFICATION_PREDELETE and _ci.is_valid() and PX.alive:
			RenderingServer.free_rid(_ci)

	# ---- transform
	var x: float:
		get: return position._x
		set(v): position.x = v
	var y: float:
		get: return position._y
		set(v): position.y = v
	var rotation: float:
		get: return _rotation
		set(v):
			if v != _rotation:
				_rotation = v
				_xf()
	var angle: float:
		get: return rad_to_deg(_rotation)
		set(v): rotation = deg_to_rad(v)
	func _xf() -> void:
		_local = Transform2D(_rotation, Vector2(scale._x, scale._y), 0.0, Vector2(position._x, position._y))
		if pivot._x != 0.0 or pivot._y != 0.0:
			_local = _local * Transform2D(0.0, Vector2(-pivot._x, -pivot._y))
		if _ci.is_valid(): RenderingServer.canvas_item_set_transform(_ci, _local)

	# ---- appearance
	var alpha: float:
		get: return _alpha
		set(v):
			if v != _alpha:
				_alpha = v
				_apply_modulate()
	var visible: bool:
		get: return _visible
		set(v):
			if v != _visible:
				_visible = v
				if _ci.is_valid(): RenderingServer.canvas_item_set_visible(_ci, v and not isMask)
	var renderable: bool:
		get: return _visible
		set(v): visible = v
	var tint:
		get: return float(_tint)
		set(v):
			_tint = int(v)
			_apply_modulate()
	func _apply_modulate() -> void:
		if _ci.is_valid(): RenderingServer.canvas_item_set_modulate(_ci, PX.color(_tint, _alpha))
	var interactive: bool:
		get: return eventMode == "static" or eventMode == "dynamic"
		set(v): eventMode = "static" if v else "passive"
	var name: String:
		get: return label
		set(v): label = v
	func cacheAsTexture(_opts = null) -> void: pass
	func updateCacheTexture() -> void: pass

	var mask:
		get: return _mask
		set(m):
			if _mask != null and _mask is PX.Container_:
				_mask.isMask = false
				if _mask._ci.is_valid(): RenderingServer.canvas_item_set_visible(_mask._ci, _mask._visible)
			_mask = m
			if m == null:
				PX._masked.erase(self)
				if _ci.is_valid():
					RenderingServer.canvas_item_set_clip(_ci, false)
					RenderingServer.canvas_item_set_custom_rect(_ci, false)
			else:
				m.isMask = true
				if m._ci.is_valid(): RenderingServer.canvas_item_set_visible(m._ci, false)
				if not PX._masked.has(self): PX._masked.append(self)
				_update_mask()
	## the mask's bounds in this object's own space become a clip rect
	func _update_mask() -> void:
		if _mask == null or destroyed or _mask.destroyed: return
		var mb = _mask._content_rect()
		if mb == null: return
		var to_local = _world().affine_inverse() * _mask._world()
		var r: Rect2 = to_local * mb
		RenderingServer.canvas_item_set_custom_rect(_ci, true, r)
		RenderingServer.canvas_item_set_clip(_ci, true)

	# ---- tree
	func _reindex(from := 0) -> void:
		for i in range(from, children.size()):
			RenderingServer.canvas_item_set_draw_index(children[i]._ci, i)
	func addChild(c, c2 = null, c3 = null, c4 = null, c5 = null, c6 = null, c7 = null, c8 = null, c9 = null, c10 = null, c11 = null, c12 = null):
		for ch in [c, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12]:
			if ch == null: continue
			if ch.parent != null: ch.parent.removeChild(ch)
			children.append(ch)
			ch._parent_ref = weakref(self)
			RenderingServer.canvas_item_set_parent(ch._ci, _ci)
			RenderingServer.canvas_item_set_draw_index(ch._ci, children.size() - 1)
			ch.emit("added", self)
			emit("childAdded", ch, self, float(children.size() - 1))
		return c
	func addChildAt(c, index):
		if c.parent != null: c.parent.removeChild(c)
		var i = clampi(int(index), 0, children.size())
		children.insert(i, c)
		c._parent_ref = weakref(self)
		RenderingServer.canvas_item_set_parent(c._ci, _ci)
		_reindex(i)
		c.emit("added", self)
		emit("childAdded", c, self, float(i))
		return c
	func _detach(c) -> void:
		c._parent_ref = null
		if c._ci.is_valid(): RenderingServer.canvas_item_set_parent(c._ci, RID())
		c.emit("removed", self)
	func removeChild(c, c2 = null, c3 = null, c4 = null):
		for ch in [c, c2, c3, c4]:
			if ch == null: continue
			var i = children.find(ch)
			if i < 0: continue
			children.remove_at(i)
			_detach(ch)
			_reindex(i)
		return c
	func removeChildAt(index):
		var c = children[int(index)]
		return removeChild(c)
	func removeChildren(begin = 0.0, end = null) -> Array:
		var b = int(begin)
		var e = children.size() if end == null else int(end)
		var out: Array = children.slice(b, e)
		for c in out: _detach(c)
		children = children.slice(0, b) + children.slice(e)
		_reindex(b)
		return out
	func removeFromParent() -> void:
		var p = parent
		if p != null: p.removeChild(self)
	func getChildAt(i): return children[int(i)]
	func getChildIndex(c) -> float: return float(children.find(c))
	func setChildIndex(c, index) -> void:
		var i = children.find(c)
		if i < 0: return
		children.remove_at(i)
		children.insert(clampi(int(index), 0, children.size()), c)
		_reindex(0)
	func swapChildren(a, b) -> void:
		var i = children.find(a)
		var j = children.find(b)
		if i < 0 or j < 0: return
		children[i] = b
		children[j] = a
		_reindex(mini(i, j))
	func getChildByLabel(l, deep = false):
		for c in children:
			if c.label == l: return c
			if deep:
				var r = c.getChildByLabel(l, true)
				if r != null: return r
		return null
	func destroy(opts = null) -> void:
		if destroyed: return
		destroyed = true
		removeFromParent()
		var deep = (opts is bool and opts) or (opts is Dictionary and JS.truthy(opts.get("children")))
		var old = children
		children = []
		for c in old:
			_detach(c)
			if deep: c.destroy(opts)
		emit("destroyed", self)
		_px_ev.clear()
		if _mask != null: mask = null
		PX._masked.erase(self)
		hitArea = null
		if _ci.is_valid():
			RenderingServer.free_rid(_ci)
			_ci = RID()

	# ---- space conversion / bounds
	func _world() -> Transform2D:
		var t = _local
		var p = parent
		while p != null:
			t = p._local * t
			p = p.parent
		return t
	var worldTransform: Transform2D:
		get: return _world()
	func toLocal(p, from = null, _point = null):
		var v = PX._v(p)
		if from != null: v = from._world() * v
		var l = _world().affine_inverse() * v
		return PX.Point.new(l.x, l.y)
	func toGlobal(p, _point = null, _skip = false):
		var g = _world() * PX._v(p)
		return PX.Point.new(g.x, g.y)
	## own drawing, local space (null if none)
	func _content_rect():
		return null
	## own drawing + visible children, in this object's local space
	func _local_rect():
		var r = _content_rect()
		for c in children:
			if not c._visible or c.isMask: continue
			var cr = c._local_rect()
			if cr == null: continue
			var t: Rect2 = c._local * cr
			r = t if r == null else r.merge(t)
		return r
	func getLocalBounds(_out = null):
		var r = _local_rect()
		return PX._rect_of(Rect2() if r == null else r)
	func getBounds(_skip = false, _out = null):
		var r = _local_rect()
		if r == null: return PX.Rectangle.new()
		return PX._rect_of(_world() * r)
	var width: float:
		get:
			var r = _local_rect()
			return 0.0 if r == null else absf(r.size.x * scale._x)
		set(v):
			var r = _local_rect()
			if r != null and r.size.x != 0.0: scale.x = v / r.size.x
	var height: float:
		get:
			var r = _local_rect()
			return 0.0 if r == null else absf(r.size.y * scale._y)
		set(v):
			var r = _local_rect()
			if r != null and r.size.y != 0.0: scale.y = v / r.size.y
	## Pixi's containsPoint (Graphics and Sprite override); local coordinates
	func _contains_local(_p: Vector2) -> bool:
		return false
	func _has_contains() -> bool:
		return false

# ------------------------------------------------------------------ Graphics

class Graphics extends Container_:
	## current path: shapes since the last fill/stroke
	var _path: Array = []
	var _tick := 0
	var _last_kind := ""
	var _last_path: Array = []
	var _bounds = null
	## filled shapes for hit tests: [kind, data...]
	var _hit_shapes: Array = []

	func _init(_opts = null) -> void:
		super(_opts)

	func _shape(s: Array):
		_path.append(s)
		_tick += 1
		return self
	func rect(rx, ry, rw, rh): return _shape(["rect", Rect2(rx, ry, rw, rh).abs()])
	func circle(cx, cy, r): return _shape(["circle", Vector2(cx, cy), absf(r)])
	func ellipse(cx, cy, rx, ry): return _shape(["poly", _ellipse_pts(Vector2(cx, cy), absf(rx), absf(ry)), true])
	func roundRect(rx, ry, rw, rh, r = 5.0): return _shape(["poly", _round_rect_pts(Rect2(rx, ry, rw, rh).abs(), r), true])
	func poly(points, close = true):
		var pts := PackedVector2Array()
		if points.size() > 0 and (points[0] is float or points[0] is int):
			for i in range(0, points.size() - 1, 2): pts.append(Vector2(points[i], points[i + 1]))
		else:
			for p in points: pts.append(PX._v(p))
		return _shape(["poly", pts, close])
	func regularPoly(cx, cy, r, sides, rot = 0.0):
		var pts := PackedVector2Array()
		var n = int(sides)
		for i in n:
			var a = rot + TAU * i / n - PI / 2.0
			pts.append(Vector2(cx + r * cos(a), cy + r * sin(a)))
		return _shape(["poly", pts, true])
	func star(cx, cy, points, r, inner = null, rot = 0.0):
		var ir = r / 2.0 if inner == null else inner
		var pts := PackedVector2Array()
		var n = int(points) * 2
		for i in n:
			var rr = r if i % 2 == 0 else ir
			var a = rot + PI * i / int(points) - PI / 2.0
			pts.append(Vector2(cx + rr * cos(a), cy + rr * sin(a)))
		return _shape(["poly", pts, true])
	func _open_path() -> Array:
		if _path.is_empty() or _path[-1][0] != "path" or _path[-1][2]:
			_shape(["path", PackedVector2Array(), false])
		return _path[-1]
	func moveTo(mx, my):
		_shape(["path", PackedVector2Array([Vector2(mx, my)]), false])
		return self
	func lineTo(lx, ly):
		var p = _open_path()
		p[1].append(Vector2(lx, ly))
		_tick += 1
		return self
	func closePath():
		if not _path.is_empty() and _path[-1][0] == "path": _path[-1][2] = true
		return self
	func beginPath():
		_path = []
		return self
	func arc(cx, cy, r, a0, a1, ccw = false):
		var p = _open_path()
		var sweep = a1 - a0
		if not ccw and sweep < 0.0: sweep += TAU
		if ccw and sweep > 0.0: sweep -= TAU
		var n = maxi(4, int(ceil(absf(sweep) * maxf(r, 2.0) / 2.0)))
		for i in n + 1:
			var a = a0 + sweep * i / n
			p[1].append(Vector2(cx + r * cos(a), cy + r * sin(a)))
		_tick += 1
		return self
	func quadraticCurveTo(cpx, cpy, tx, ty, _smooth = null):
		var p = _open_path()
		var s: Vector2 = p[1][-1] if p[1].size() > 0 else Vector2(cpx, cpy)
		for i in range(1, 13):
			var t = i / 12.0
			p[1].append(s.lerp(Vector2(cpx, cpy), t).lerp(Vector2(cpx, cpy).lerp(Vector2(tx, ty), t), t))
		_tick += 1
		return self
	func bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty, _smooth = null):
		var p = _open_path()
		var s: Vector2 = p[1][-1] if p[1].size() > 0 else Vector2(c1x, c1y)
		for i in range(1, 17):
			var t = i / 16.0
			p[1].append(s.bezier_interpolate(Vector2(c1x, c1y), Vector2(c2x, c2y), Vector2(tx, ty), t))
		_tick += 1
		return self

	static func _ellipse_pts(c: Vector2, rx: float, ry: float) -> PackedVector2Array:
		var n = clampi(int(ceil((rx + ry) * 1.6)), 12, 96)
		var pts := PackedVector2Array()
		for i in n:
			var a = TAU * i / n
			pts.append(c + Vector2(cos(a) * rx, sin(a) * ry))
		return pts
	static func _round_rect_pts(r: Rect2, rad: float) -> PackedVector2Array:
		var rr = clampf(rad, 0.0, minf(r.size.x, r.size.y) / 2.0)
		if rr <= 0.0: return PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])
		var pts := PackedVector2Array()
		var seg = clampi(int(ceil(rr)), 2, 12)
		var cs = [Vector2(r.end.x - rr, r.position.y + rr), Vector2(r.end.x - rr, r.end.y - rr), Vector2(r.position.x + rr, r.end.y - rr), Vector2(r.position.x + rr, r.position.y + rr)]
		for k in 4:
			for i in seg + 1:
				var a = -PI / 2.0 + PI / 2.0 * k + PI / 2.0 * i / seg
				pts.append(cs[k] + Vector2(cos(a), sin(a)) * rr)
		return pts

	func _style(style, alpha) -> Dictionary:
		var out = {"color": 0xffffff, "alpha": 1.0}
		if style is Array: style = style[0] if style.size() > 0 else null
		if style is Dictionary:
			for k in style: out[k] = style[k]
			if not style.has("color") and not style.has("fill"): out["color"] = 0xffffff
			if style.has("fill"): out["color"] = style["fill"]
		elif style != null:
			out["color"] = style
		if alpha != null: out["alpha"] = alpha
		return out
	func _grow(r: Rect2) -> void:
		_bounds = r if _bounds == null else _bounds.merge(r)
	func _take_path(other: String) -> Array:
		var p = _path
		if _tick == 0 and _last_kind == other: p = _last_path
		return p
	func _done(kind: String, p: Array) -> void:
		_last_kind = kind
		_last_path = p
		_path = []
		_tick = 0

	func fill(style = null, alpha = null):
		var _pt0 = Time.get_ticks_usec() if PX.prof else 0
		var col: Color
		if style is float and alpha == null: col = PX.rgb(style)
		else:
			var st = _style(style, alpha)
			col = PX.color(st["color"], float(st["alpha"]))
		var p = _take_path("stroke")
		for s in p:
			match s[0]:
				"rect":
					var r: Rect2 = s[1]
					if r.size.x > 0.0 and r.size.y > 0.0:
						RenderingServer.canvas_item_add_rect(_ci, r, col)
						_grow(r)
						_hit_shapes.append(s)
				"circle":
					var c: Vector2 = s[1]
					var r: float = s[2]
					if r > 0.0:
						_fill_poly(_ellipse_pts(c, r, r), col)
						_grow(Rect2(c - Vector2(r, r), Vector2(r, r) * 2.0))
						_hit_shapes.append(s)
				"poly", "path":
					var pts: PackedVector2Array = s[1]
					if pts.size() >= 3:
						_fill_poly(pts, col)
						_grow(_pts_rect(pts))
						_hit_shapes.append(["poly", pts])
		_done("fill", p)
		if PX.prof:
			PX.prof_gfx_us += Time.get_ticks_usec() - _pt0
			PX.prof_gfx_n += 1
		return self
	static func _pts_rect(pts: PackedVector2Array) -> Rect2:
		var r = Rect2(pts[0], Vector2.ZERO)
		for v in pts: r = r.expand(v)
		return r
	func _fill_poly(pts0: PackedVector2Array, col: Color) -> void:
		# drop repeated points (the triangulator rejects them)
		var pts := PackedVector2Array()
		for v in pts0:
			if pts.is_empty() or not pts[-1].is_equal_approx(v): pts.append(v)
		if pts.size() > 2 and pts[0].is_equal_approx(pts[-1]): pts.remove_at(pts.size() - 1)
		if pts.size() < 3: return
		var idx = Geometry2D.triangulate_polygon(pts)
		if idx.is_empty():
			# self-intersecting: fall back to a fan (fine for the near-convex shapes the game draws)
			for i in range(1, pts.size() - 1):
				idx.append(0)
				idx.append(i)
				idx.append(i + 1)
		var cols := PackedColorArray()
		cols.resize(pts.size())
		cols.fill(col)
		RenderingServer.canvas_item_add_triangle_array(_ci, idx, pts, cols)

	func stroke(style = null):
		var st = _style(style, null)
		if not (style is Dictionary and style.has("color")) and not (style is Array) and not (style is float or style is int):
			st["color"] = 0x000000 if style == null else st["color"]
		var w = float(st.get("width", 1.0))
		var col = PX.color(st["color"], float(st["alpha"]))
		var align = float(st.get("alignment", 0.5))
		var round_cap = st.get("cap", "butt") == "round"
		var p = _take_path("fill")
		if w > 0.0:
			for s in p:
				match s[0]:
					"rect":
						_stroke_rect(s[1], w, align, col)
					"circle":
						var r = s[2] - (align - 0.5) * w
						var pts = _ellipse_pts(s[1], r, r)
						pts.append(pts[0])
						RenderingServer.canvas_item_add_polyline(_ci, pts, PackedColorArray([col]), w)
						_grow(Rect2(s[1] - Vector2(r + w, r + w), Vector2(r + w, r + w) * 2.0))
					"poly", "path":
						var pts: PackedVector2Array = s[1]
						if pts.size() < 2: continue
						var line = pts
						if s[2] and pts.size() > 2:
							line = pts.duplicate()
							line.append(pts[0])
						RenderingServer.canvas_item_add_polyline(_ci, line, PackedColorArray([col]), w)
						if round_cap and not s[2]:
							RenderingServer.canvas_item_add_circle(_ci, line[0], w / 2.0, col)
							RenderingServer.canvas_item_add_circle(_ci, line[-1], w / 2.0, col)
						_grow(_pts_rect(line).grow(w / 2.0))
		_done("stroke", p)
		return self
	func _stroke_rect(r: Rect2, w: float, align: float, col: Color) -> void:
		var d = (align - 0.5) * w
		var outer = r.grow(w / 2.0 - d)
		var inner = r.grow(-(w / 2.0 + d))
		var t = inner.position.y - outer.position.y
		var b = outer.end.y - inner.end.y
		var l = inner.position.x - outer.position.x
		var rt = outer.end.x - inner.end.x
		if inner.size.x <= 0.0 or inner.size.y <= 0.0:
			RenderingServer.canvas_item_add_rect(_ci, outer, col)
		else:
			RenderingServer.canvas_item_add_rect(_ci, Rect2(outer.position, Vector2(outer.size.x, t)), col)
			RenderingServer.canvas_item_add_rect(_ci, Rect2(outer.position.x, inner.end.y, outer.size.x, b), col)
			RenderingServer.canvas_item_add_rect(_ci, Rect2(outer.position.x, inner.position.y, l, inner.size.y), col)
			RenderingServer.canvas_item_add_rect(_ci, Rect2(inner.end.x, inner.position.y, rt, inner.size.y), col)
		_grow(outer)

	func clear_():
		if _ci.is_valid(): RenderingServer.canvas_item_clear(_ci)
		_path = []
		_tick = 0
		_last_kind = ""
		_last_path = []
		_bounds = null
		_hit_shapes = []
		return self
	func _content_rect():
		return _bounds
	func _has_contains() -> bool: return true
	func _contains_local(p: Vector2) -> bool:
		for s in _hit_shapes:
			match s[0]:
				"rect":
					if s[1].has_point(p): return true
				"circle":
					if p.distance_to(s[1]) <= s[2]: return true
				"poly":
					if Geometry2D.is_point_in_polygon(p, s[1]): return true
		return false
	func containsPoint(p) -> bool:
		return _contains_local(PX._v(p))

# ------------------------------------------------------------------ textures and sprites

class TextureSource extends RefCounted:
	var _tex: Texture2D = null
	var scaleMode := "nearest"
	var width: float:
		get: return float(_tex.get_width()) if _tex != null else 0.0
	var height: float:
		get: return float(_tex.get_height()) if _tex != null else 0.0
	var resource = null
	func destroy() -> void: _tex = null
	func update() -> void: pass

class Texture_ extends RefCounted:
	var source: PX.TextureSource
	var _frame := Rect2()
	var label := ""
	var destroyed := false
	static var _white = null
	static var _empty = null
	static var WHITE: PX.Texture_:
		get:
			if _white == null:
				var img = Image.create(1, 1, false, Image.FORMAT_RGBA8)
				img.fill(Color.WHITE)
				_white = PX.Texture_._of(ImageTexture.create_from_image(img))
			return _white
	static var EMPTY: PX.Texture_:
		get:
			if _empty == null: _empty = PX.Texture_.new()
			return _empty
	func _init(opts = null) -> void:
		source = PX.TextureSource.new()
		if opts is Dictionary:
			if opts.get("source") != null: source = opts["source"]
			if opts.get("frame") != null: _frame = opts["frame"]._rect()
			elif source._tex != null: _frame = Rect2(0, 0, source.width, source.height)
	static func _of(t: Texture2D) -> PX.Texture_:
		var tx = PX.Texture_.new()
		tx.source._tex = t
		tx._frame = Rect2(0, 0, t.get_width(), t.get_height()) if t != null else Rect2()
		return tx
	## Texture.from(canvas | url)
	static func from(src, _skip = false) -> PX.Texture_:
		if src is String: return PX.Assets._load_now(src)
		if src is Object and src.has_method("_to_texture"): return PX.Texture_._of(src._to_texture())
		return PX.Texture_.new()
	var frame: PX.Rectangle:
		get: return PX._rect_of(_frame)
		set(r):
			_frame = r._rect()
	var width: float:
		get: return _frame.size.x
	var height: float:
		get: return _frame.size.y
	var orig: PX.Rectangle:
		get: return PX._rect_of(_frame)
	func update() -> void: pass
	func destroy(_destroy_source = false) -> void:
		destroyed = true
		if _destroy_source: source.destroy()

class Sprite extends Container_:
	var _texture: PX.Texture_ = null
	var anchor: PX.Point = _anchor()
	var roundPixels := true
	func _anchor() -> PX.Point:
		var p = PX.Point.new()
		p._cb = _redraw
		return p
	func _init(tex = null) -> void:
		super()
		if tex is Dictionary:
			var o: Dictionary = tex
			tex = o.get("texture")
			if o.has("anchor"):
				var a = o["anchor"]
				if a is float or a is int: anchor.set_(a)
				else: anchor.copyFrom(a)
		_texture = tex if tex != null else PX.Texture_.EMPTY
		_redraw()
	static func from(src, _skip = false) -> PX.Sprite:
		return PX.Sprite.new(src if src is PX.Texture_ else PX.Texture_.from(src))
	var texture: PX.Texture_:
		get: return _texture
		set(t):
			_texture = t if t != null else PX.Texture_.EMPTY
			_redraw()
	func _redraw() -> void:
		if not _ci.is_valid(): return
		RenderingServer.canvas_item_clear(_ci)
		var t = _texture
		if t == null or t.source == null or t.source._tex == null or t._frame.size.x <= 0.0: return
		var sz = t._frame.size
		RenderingServer.canvas_item_add_texture_rect_region(_ci, Rect2(-anchor._x * sz.x, -anchor._y * sz.y, sz.x, sz.y), t.source._tex.get_rid(), t._frame)
	func _content_rect():
		if _texture == null: return null
		var sz = _texture._frame.size
		return Rect2(-anchor._x * sz.x, -anchor._y * sz.y, sz.x, sz.y)
	func _has_contains() -> bool: return true
	func _contains_local(p: Vector2) -> bool:
		var r = _content_rect()
		return r != null and r.has_point(p)
	func containsPoint(p) -> bool: return _contains_local(PX._v(p))
	## Sprite tint only colours the sprite itself
	func _apply_modulate() -> void:
		if not _ci.is_valid(): return
		RenderingServer.canvas_item_set_modulate(_ci, Color(1, 1, 1, _alpha))
		RenderingServer.canvas_item_set_self_modulate(_ci, PX.color(_tint))

# ------------------------------------------------------------------ assets

class Assets:
	static var _cache := {}
	static func _load_now(url: String) -> PX.Texture_:
		if _cache.has(url): return _cache[url]
		var t: PX.Texture_
		var res = ResourceLoader.load(url) if ResourceLoader.exists(url) else null
		if res is Texture2D: t = PX.Texture_._of(res)
		else:
			var img = Image.load_from_file(url) if FileAccess.file_exists(url) else null
			t = PX.Texture_._of(ImageTexture.create_from_image(img)) if img != null else PX.Texture_.new()
		_cache[url] = t
		return t
	static func load_(url):
		if url is Array:
			var out = {}
			for u in url: out[u] = _load_now(u)
			return JSPromise.resolve(out)
		return JSPromise.resolve(_load_now(url))
	static func get_(url): return _cache.get(url)

# ------------------------------------------------------------------ ticker

class Ticker extends RefCounted:
	static var _shared = null
	static var shared: PX.Ticker:
		get:
			if _shared == null: _shared = PX.Ticker.new()
			return _shared
	var deltaMS := 1000.0 / 60.0
	var deltaTime := 1.0
	var elapsedMS := 1000.0 / 60.0
	var lastTime := 0.0
	var speed := 1.0
	var started := true
	var autoStart := true
	var maxFPS := 0.0
	var minFPS := 10.0
	var FPS: float:
		get: return 1000.0 / maxf(1.0, elapsedMS)
	var _ls: Array = []
	func add(fn, ctx = null, priority = 0.0):
		var e = [fn, ctx, float(priority), false]
		var i = 0
		while i < _ls.size() and _ls[i][2] >= e[2]: i += 1
		_ls.insert(i, e)
		return self
	func addOnce(fn, ctx = null, priority = 0.0):
		add(fn, ctx, priority)
		_ls[_ls.find_custom(func(x): return x[0] == fn)][3] = true
		return self
	func remove(fn, ctx = null):
		for i in range(_ls.size() - 1, -1, -1):
			if _ls[i][0] == fn and (ctx == null or _ls[i][1] == ctx):
				_ls.remove_at(i)
		return self
	func start() -> void: started = true
	func stop() -> void: started = false
	func destroy() -> void: _ls.clear()
	var count: float:
		get: return float(_ls.size())
	func _update(dt_ms: float, now_ms: float) -> void:
		if not started: return
		elapsedMS = dt_ms
		var d = dt_ms
		if minFPS > 0.0: d = minf(d, 1000.0 / minFPS)
		deltaMS = d * speed
		deltaTime = deltaMS / (1000.0 / 60.0)
		lastTime = now_ms
		for e in _ls.duplicate():
			if not _ls.has(e): continue
			if e[3]: _ls.erase(e)
			if PX.prof:
				var t0 = Time.get_ticks_usec()
				JS.call_(e[0], [self])
				var k = str(e[0].get_method()) + "@" + str(e[0].get_object().get_script().resource_path.get_file() if e[0].get_object() != null and e[0].get_object().get_script() != null else "?")
				PX.prof_ticker[k] = PX.prof_ticker.get(k, 0) + Time.get_ticks_usec() - t0
			else:
				JS.call_(e[0], [self])

# ------------------------------------------------------------------ application

class Renderer extends RefCounted:
	var width := 480.0
	var height := 270.0
	var resolution := 1.0
	var events = {"cursorStyles": {}, "setCursor": func(_c): pass}
	func resize(w, h, res = null) -> void:
		width = w
		height = h
		if res != null: resolution = res

class Application extends RefCounted:
	var stage: PX.Container_
	var ticker: PX.Ticker
	var renderer: PX.Renderer
	var canvas
	var screen: PX.Rectangle
	func _init() -> void:
		stage = PX.Container_.new()
		ticker = PX.Ticker.new()
		renderer = PX.Renderer.new()
		canvas = DOM.HTMLCanvas.new()
		screen = PX.Rectangle.new(0, 0, 480, 270)
	func init(opts = null):
		if opts is Dictionary:
			renderer.width = float(opts.get("width", 480.0))
			renderer.height = float(opts.get("height", 270.0))
			screen = PX.Rectangle.new(0, 0, renderer.width, renderer.height)
			if opts.has("background"): RenderingServer.set_default_clear_color(PX.color(opts["background"]))
		PXHost.attach(self)
		return JSPromise.resolve(null)
	func render() -> void: pass
	func destroy(_a = null, _b = null) -> void: stage.destroy({"children": true})
