## Godot version of src/ui/touch.ts: two-finger pinch = magnifier over the whole game
## (scales the PX host; pointer coordinates follow through PXHost._pos). The screen is
## locked to landscape in the project settings, so there is no rotate prompt.
class_name M_ui_touch

const MAX_ZOOM := 3.0
static var zoom := 1.0
static var pan := Vector2.ZERO

static func _apply() -> void:
	zoom = clampf(zoom, 1.0, MAX_ZOOM)
	if PXHost.inst == null: return
	var size = Vector2(480, 270)
	var m = (zoom - 1.0) * size / 2.0
	pan = pan.clamp(-m, m)
	if zoom <= 1.001:
		zoom = 1.0
		pan = Vector2.ZERO
	# scale about the centre
	PXHost.inst.scale = Vector2(zoom, zoom)
	PXHost.inst.position = size / 2.0 - size / 2.0 * zoom + pan

static func zoomBy(f) -> void:
	var z = clampf(zoom * float(f), 1.0, MAX_ZOOM)
	pan = pan * z / zoom
	zoom = z
	_apply()

static func resetZoom() -> void:
	zoom = 1.0
	_apply()

static func getZoom() -> float:
	return zoom

static func installTouch() -> void: pass

static func attachTouchCanvas(_c) -> void: pass

## PXHost forwards pinch / two-finger pan gestures here
static func gesture(e: InputEvent) -> bool:
	if e is InputEventMagnifyGesture:
		zoomBy(e.factor)
		return true
	if e is InputEventPanGesture:
		pan -= e.delta
		_apply()
		return true
	return false
