## Quick Fight tour
extends RefCounted

func run(m) -> void:
	var dir = OS.get_environment("SHOTS")
	await m.wait(3.0)
	m.click(86, 100)  # MODES
	await m.wait(1.0)
	m.click(334, 218)  # QUICK FIGHT: PLAY
	await m.wait(2.0)
	await m.shot(dir + "/10_quickfight.png")
	m.click(240, 254)  # FIGHT!
	await m.wait(6.0)
	await m.shot(dir + "/11_fight_a.png")
	await m.wait(6.0)
	await m.shot(dir + "/12_fight_b.png")
	for i in 30:
		m.key(" ", "Space")
		await m.wait(0.3)
	await m.shot(dir + "/13_fight_c.png")
	m.get_tree().quit()
