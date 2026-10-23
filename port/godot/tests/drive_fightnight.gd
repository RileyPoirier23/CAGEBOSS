## Fight night: a career simulated to its first event, then the fight-night scene played through
extends RefCounted

func run(m) -> void:
	var dir = OS.get_environment("SHOTS")
	await m.wait(2.0)
	var g = m.game
	var s = M_sim_newgame.createNewGame({"seed": 77.0, "mode": "career", "difficulty": "normal", "promotionName": "Test FC", "presidentName": "Test Boss"})
	g.state = s
	for i in 30:
		if M_sim_events.eventThisWeek(s) != null: break
		M_sim_week.simulateWeek(s, M_sim_policies.POLICIES.get("balanced"))
	M_sim_week.startWeek(s)
	s["phase"] = "fightnight"
	printerr("fight night week ", s.get("week"))
	M_ui_flow.routePhase(g, true)
	await m.wait(3.0)
	await m.shot(dir + "/30_fn_a.png")
	for i in 20:
		m.key("Enter")
		await m.wait(0.8)
	await m.shot(dir + "/31_fn_b.png")
	for i in 30:
		m.key("Enter")
		await m.wait(0.8)
	await m.shot(dir + "/32_fn_c.png")
	m.get_tree().quit()
