## JavaScript Promise. Settles synchronously when it can; callbacks run as microtasks
## (JS.flush_microtasks, called by PXHost after every event and frame), like the browser.
class_name JSPromise
extends RefCounted

var _state := 0 # 0 pending, 1 fulfilled, 2 rejected
var _value = null
var _cbs: Array = []

func _init(executor = null) -> void:
	if executor != null:
		JS.call_(executor, [func(v = null): _settle(1, v), func(e = null): _settle(2, e)])

static func resolve(v = null) -> JSPromise:
	if v is JSPromise: return v
	var p = JSPromise.new()
	p._settle(1, v)
	return p

static func reject(e = null) -> JSPromise:
	var p = JSPromise.new()
	p._settle(2, e)
	return p

static func all(items) -> JSPromise:
	var arr: Array = JS.iter(items)
	var out := []
	out.resize(arr.size())
	var p = JSPromise.new()
	if arr.is_empty():
		p._settle(1, out)
		return p
	var left = [arr.size()]
	for i in arr.size():
		JSPromise.resolve(arr[i]).then(func(v):
			out[i] = v
			left[0] -= 1
			if left[0] == 0: p._settle(1, out), func(e): p._settle(2, e))
	return p

func _settle(st: int, v) -> void:
	if _state != 0: return
	if st == 1 and v is JSPromise:
		v.then(func(x): _settle(1, x), func(e): _settle(2, e))
		return
	_state = st
	_value = v
	for c in _cbs: _schedule(c)
	_cbs.clear()

func _schedule(c: Array) -> void:
	JS.queue_microtask(func():
		var cb = c[0] if _state == 1 else c[1]
		if cb == null:
			c[2]._settle(_state, _value)
		else:
			c[2]._settle(1, JS.call_(cb, [_value])))

func then(on_ok = null, on_err = null) -> JSPromise:
	var p = JSPromise.new()
	var c = [on_ok, on_err, p]
	if _state == 0: _cbs.append(c)
	else: _schedule(c)
	return p

func catch(on_err = null) -> JSPromise:
	return then(null, on_err)

func finally(f = null) -> JSPromise:
	return then(func(v):
		JS.call_(f, [])
		return v, func(e):
		JS.call_(f, [])
		return JSPromise.reject(e))
