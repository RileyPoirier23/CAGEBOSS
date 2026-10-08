## Hosts the PX stage in the scene tree: frame loop (tickers, animation frames, microtasks,
## masks), keyboard/window events for DOM listeners, and Pixi's pointer event rules
## (hit testing, bubbling, over/out, tap, upoutside, globalpointermove, wheel).
class_name PXHost
extends Node2D

static var inst: PXHost = null
static var app = null

var _last_ms := 0.0
## pointerId -> press path (deepest first)
var _press := {}
## pointerId -> current over path (deepest first)
var _over := {}
var _last_pos := {}

static func attach(a) -> void:
	app = a
	if inst != null: inst._attach_stage()

func _ready() -> void:
	inst = self
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_sync_window()
	get_viewport().size_changed.connect(func():
		_sync_window()
		DOM.dispatch(DOM.DomEvent.new("resize")))
	if app != null: _attach_stage()
	_last_ms = Time.get_ticks_usec() / 1000.0

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_PREDELETE:
		PX.alive = false

func _exit_tree() -> void:
	PX.alive = false
	# drop every callback held in a static store before Godot unloads the scripts
	DOM.shutdown()
	JS.shutdown()
	GenRegistry.shutdown()
	PX.Ticker.shared._ls.clear()
	if app != null:
		app.ticker._ls.clear()
		app.stage._px_ev.clear()
	app = null

func _attach_stage() -> void:
	PX.root_ci = get_canvas_item()
	RenderingServer.canvas_item_set_parent(app.stage._ci, get_canvas_item())

func _sync_window() -> void:
	var s = DisplayServer.window_get_size()
	DOM.window.innerWidth = float(s.x)
	DOM.window.innerHeight = float(s.y)

static var script_ms := 0.0

func _process(_delta: float) -> void:
	var t0 = Time.get_ticks_usec()
	var now = t0 / 1000.0
	var dt = now - _last_ms
	_last_ms = now
	DOM.run_animation_frames(now)
	JS.flush_microtasks()
	PX.Ticker.shared._update(dt, now)
	JS.flush_microtasks()
	if app != null: app.ticker._update(dt, now)
	JS.flush_microtasks()
	for m in PX._masked.duplicate(): m._update_mask()
	_update_cursor()
	script_ms = (Time.get_ticks_usec() - t0) / 1000.0

# ------------------------------------------------------------------ input

func _unhandled_input(e: InputEvent) -> void:
	if M_ui_touch.gesture(e): return
	if e is InputEventKey:
		var ev = DOM.key_event(e)
		DOM.dispatch(ev)
		JS.flush_microtasks()
		return
	if app == null: return
	if e is InputEventMouseButton:
		var p = _pos(e.position)
		if e.button_index == MOUSE_BUTTON_WHEEL_UP or e.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if e.pressed: _wheel(p, -100.0 if e.button_index == MOUSE_BUTTON_WHEEL_UP else 100.0)
		elif e.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE]:
			var btn = {MOUSE_BUTTON_LEFT: 0.0, MOUSE_BUTTON_MIDDLE: 1.0, MOUSE_BUTTON_RIGHT: 2.0}[e.button_index]
			if e.pressed: _down(1.0, "mouse", p, btn)
			else: _up(1.0, "mouse", p, btn)
	elif e is InputEventMouseMotion:
		_move(1.0, "mouse", _pos(e.position))
	elif e is InputEventScreenTouch:
		var id = float(e.index + 2)
		var p = _pos(e.position)
		if e.pressed:
			_move(id, "touch", p)
			_down(id, "touch", p, 0.0)
		else:
			_up(id, "touch", p, 0.0)
			_out_all(id)
	elif e is InputEventScreenDrag:
		_move(float(e.index + 2), "touch", _pos(e.position))
	JS.flush_microtasks()

## viewport position -> stage position
func _pos(v: Vector2) -> Vector2:
	return get_global_transform_with_canvas().affine_inverse() * v

func _event(type: String, id: float, ptype: String, p: Vector2, btn := 0.0) -> PX.FederatedEvent:
	var e = PX.FederatedEvent.new()
	e.type = type
	e.pointerId = id
	e.pointerType = ptype
	e.isPrimary = id <= 2.0
	e.global = PX.Point.new(p.x, p.y)
	e.button = btn
	e.buttons = 1.0 if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) else 0.0
	return e

func _dom_pointer(type: String, id: float, ptype: String, p: Vector2, btn: float) -> void:
	var de = DOM.DomEvent.new(type)
	de.pointerType = ptype
	de.pointerId = id
	de.clientX = p.x
	de.clientY = p.y
	de.button = btn
	DOM.dispatch(de)

# ---- hit testing (Pixi v8 EventBoundary.hitTestRecursive)

static func _interactive(o) -> bool:
	return o.eventMode == "static" or o.eventMode == "dynamic"

## returns the path (deepest first) to the hit target, [] when only passive things were hit, null for a miss
func _hit(o, p: Vector2, parent_interactive: bool) -> Variant:
	if o == null or o.destroyed or not o._visible or o.isMask: return null
	if o.eventMode == "none": return null
	if o.eventMode == "passive" and not o.interactiveChildren and not _interactive(o): return null
	var w = o._world()
	var lp = w.affine_inverse() * p
	if o._mask != null and not o._mask.destroyed:
		var mr = o._mask._content_rect()
		if mr != null:
			var mp = o._mask._world().affine_inverse() * p
			if not mr.has_point(mp): return null
	if o.hitArea != null and not PX._contains(o.hitArea, lp): return null
	var me_i = _interactive(o)
	var test_children = parent_interactive or me_i
	if o.interactiveChildren:
		for i in range(o.children.size() - 1, -1, -1):
			var nested: Variant = _hit(o.children[i], p, test_children)
			if nested != null:
				if nested.size() > 0 or me_i: nested.append(o)
				return nested
	if (parent_interactive or me_i):
		var hit_self = false
		if o.hitArea != null: hit_self = true
		elif o._has_contains(): hit_self = o._contains_local(lp)
		if hit_self: return [o] if me_i else []
	return null

func _path_at(p: Vector2) -> Array:
	if app == null: return []
	var r: Variant = _hit(app.stage, p, false)
	if r == null: return []
	# deepest first; keep only interactive objects plus their ancestors for bubbling
	if r.is_empty(): return []
	var out: Array = []
	var t = r[0]
	while t != null:
		out.append(t)
		t = t.parent
	return out

func _propagate(e: PX.FederatedEvent, path: Array) -> void:
	if path.is_empty(): return
	e.target = path[0]
	for o in path:
		if e.propagationStopped: break
		if o.destroyed: continue
		e.currentTarget = o
		o.emit(e.type, e)

# ---- pointer flow

func _down(id: float, ptype: String, p: Vector2, btn: float) -> void:
	_dom_pointer("pointerdown", id, ptype, p, btn)
	var path = _path_at(p)
	_press[id] = path
	var e = _event("pointerdown", id, ptype, p, btn)
	_propagate(e, path)
	if btn == 2.0:
		var r = _event("rightdown", id, ptype, p, btn)
		_propagate(r, path)
	else:
		_propagate(_event("mousedown" if ptype == "mouse" else "touchstart", id, ptype, p, btn), path)

func _up(id: float, ptype: String, p: Vector2, btn: float) -> void:
	_dom_pointer("pointerup", id, ptype, p, btn)
	if ptype == "touch": _dom_pointer("touchend", id, ptype, p, btn)
	_dom_pointer("click", id, ptype, p, btn)
	var path = _path_at(p)
	_propagate(_event("pointerup", id, ptype, p, btn), path)
	var pressed: Array = _press.get(id, [])
	_press.erase(id)
	if pressed.is_empty(): return
	var press_target = pressed[0]
	if not path.has(press_target):
		# released elsewhere: upoutside to the press target and its ancestors that aren't under the pointer
		var e = _event("pointerupoutside", id, ptype, p, btn)
		e.target = press_target
		for o in pressed:
			if path.has(o) or e.propagationStopped: break
			if o.destroyed: continue
			e.currentTarget = o
			o.emit("pointerupoutside", e)
	# tap: the deepest object both pressed and released on
	var click_target = null
	for o in pressed:
		if path.has(o):
			click_target = o
			break
	if click_target != null and not click_target.destroyed:
		var tp: Array = []
		var t = click_target
		while t != null:
			tp.append(t)
			t = t.parent
		_propagate(_event("pointertap", id, ptype, p, btn), tp)
		if btn != 2.0: _propagate(_event("click" if ptype == "mouse" else "tap", id, ptype, p, btn), tp)

func _move(id: float, ptype: String, p: Vector2) -> void:
	var prev: Vector2 = _last_pos.get(id, p)
	_last_pos[id] = p
	var de = DOM.DomEvent.new("pointermove")
	de.movementX = (p.x - prev.x) * 3.0
	de.movementY = (p.y - prev.y) * 3.0
	de.pointerType = ptype
	de.pointerId = id
	de.clientX = p.x
	de.clientY = p.y
	DOM.dispatch(de)
	var path = _path_at(p)
	var old: Array = _over.get(id, [])
	var old_t = old[0] if not old.is_empty() else null
	var new_t = path[0] if not path.is_empty() else null
	if old_t != new_t:
		if old_t != null and not old_t.destroyed:
			var oe = _event("pointerout", id, ptype, p)
			_propagate(oe, old.filter(func(o): return not o.destroyed))
			for o in old:
				if not path.has(o) and not o.destroyed: o.emit("pointerleave", _event("pointerleave", id, ptype, p))
		if new_t != null:
			_propagate(_event("pointerover", id, ptype, p), path)
			for o in path:
				if not old.has(o): o.emit("pointerenter", _event("pointerenter", id, ptype, p))
	_over[id] = path
	_propagate(_event("pointermove", id, ptype, p), path)
	# globalpointermove reaches every listening object
	var ge = _event("globalpointermove", id, ptype, p)
	_global_move(app.stage, ge)

func _global_move(o, e: PX.FederatedEvent) -> void:
	if o == null or o.destroyed: return
	if o._px_ev.has("globalpointermove"):
		e.target = o
		e.currentTarget = o
		o.emit("globalpointermove", e)
	for c in o.children.duplicate(): _global_move(c, e)

func _out_all(id: float) -> void:
	var old: Array = _over.get(id, [])
	if not old.is_empty():
		var p = _last_pos.get(id, Vector2.ZERO)
		_propagate(_event("pointerout", id, "touch", p), old.filter(func(o): return not o.destroyed))
	_over.erase(id)

func _wheel(p: Vector2, dy: float) -> void:
	var de = DOM.DomEvent.new("wheel")
	de.deltaY = dy
	de.clientX = p.x
	de.clientY = p.y
	DOM.dispatch(de)
	var path = _path_at(p)
	var e = _event("wheel", 1.0, "mouse", p)
	e.deltaY = dy
	_propagate(e, path)

func _update_cursor() -> void:
	var path: Array = _over.get(1.0, [])
	var shape = Input.CURSOR_ARROW
	for o in path:
		if o.destroyed: continue
		if o.cursor != null:
			shape = Input.CURSOR_POINTING_HAND if str(o.cursor) == "pointer" else Input.CURSOR_ARROW
			break
	if Input.get_current_cursor_shape() != shape: Input.set_default_cursor_shape(shape)
