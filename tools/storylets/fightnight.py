from dsl import *

FILE = 'fightnight'
WIN = F("f.id == lastWinner")
LOSE = F("f.id == lastLoser")


def FN(id, title, scenes, choices, roles=None, cond=None, cd=6, weight=10, **kw):
    S(FILE, id, title, 'fightnight', scenes, choices, roles=roles, cond=cond, cd=cd, weight=weight, **kw)


FN('fn_mic_callout_boss', 'Calling Out The Boss', [sc('fightnight', "{subject.first} grabs the mic after the win, still bleeding. \"And {presidentLast}! I KNOW you're watching! PAY ME! Pay me what you pay the guys with the big Instagrams!\" Twenty thousand people chant 'PAY HIM'.", "{subject.first} {subject.last}")],
   [C("Walk into the cage and hug {him} on camera", "subject.loyalty += 10", "fans += 3", "raise(subject, 20)", "fighters += 2", result="You hug {him}. You announce a raise on the mic. The crowd goes insane. Your accountant goes pale.", ethics=1),
    C("Laugh it off from cageside", "subject.beef += 8", "fans += 1", "news('callout', 0.2, 4)", result="You laugh. {He} doesn't. The clip trends anyway.", default=True),
    C("Cut {his} mic", "subject.beef += 20", "fans -= 3", "media -= 2", "fighters -= 2", result="The mic dies mid-sentence. The crowd boos you for six straight minutes.", bot=1)],
   roles={"subject": WIN}, cond="lastWinner != ''", weight=14)

FN('fn_mic_callout_rival', 'The Callout', [sc('fightnight', "{subject.first} points into the crowd at {other.first} {other.last}. \"YOU! You've been ducking me for a year! Get in here!\" {other.last} stands up and takes off {his} jacket. Security is getting nervous.", "{subject.first} {subject.last}")],
   [C("Let {other.last} in the cage for a faceoff", "rivalry(subject, other)", "subject.hype += 10", "other.hype += 8", "fans += 3", "commission -= 1", result="The faceoff almost turns into a fight. The fight between them is now the most anticipated on the planet.", bot=2),
    C("Have security keep them apart", "rivalry(subject, other)", "subject.hype += 5", result="Shoving through security. Great footage. Nobody gets hurt.", default=True)],
   roles={"subject": WIN, "other": F("f.ours && f.id != lastWinner && f.id != lastLoser && f.division == subject.division")}, cond="lastWinner != ''", weight=14)

FN('fn_brawl_cage', 'Post-Fight Brawl', [sc('fightnight', "The final bell is followed by a different bell: {subject.last}'s cornerman shoves {other.last}'s cornerman. Within ten seconds there are fourteen people in the cage, one of them is a commentator, and one is just a guy in a hot dog costume.")],
   [C("Pay commission fines and move on ({$fine})", "spend('fines', vars.fine)", "commission -= 3", "fans += 2", result="The hot-dog guy is the only one who lands a clean punch. The commission fines everyone except the hot dog.", default=True),
    C("Suspend both corners", "commission += 2", "subject.morale -= 4", "other.morale -= 4", "media += 1", result="Both cornermen are banned for six months. One of them is somebody's dad.", ethics=1),
    C("Book a rematch immediately", "rivalry(subject, other)", "subject.hype += 8", "other.hype += 8", "commission -= 4", result="'You want more? You got it.' The rematch is the biggest fight of the season.", bot=2)],
   roles={"subject": F("f.id == lastA"), "other": F("f.id == lastB")}, vars={"fine": money(10, 30)}, weight=10)

FN('fn_fan_invasion', 'Cage Invader', [sc('fightnight', "A shirtless fan sprinted past security, climbed the cage and tried to hug {subject.first}. {subject.first} instinctively double-legged him. The crowd is chanting {subject.last}'s name AND the fan's name, which they somehow know.")],
   [C("Ban the fan for life", "media += 1", "commission += 1", result="Banned. He's a hero online. He starts a podcast.", default=True),
    C("Give the fan a tryout", "fans += 4", "commission -= 2", "media += 1", result="The fan, Kevin, signs a regional contract. He's 0-3 now, but he's happy.", bot=1)],
   roles={"subject": WIN}, cond="lastWinner != ''", weight=8)

FN('fn_refuses_leave', 'Won\'t Leave The Cage', [sc('fightnight', "{subject.first} lost and refuses to leave the cage. {He} is sitting cross-legged in the center, demanding the fight be overturned. The next fight's walkout music is playing. {He} is not moving.", "{subject.first} {subject.last}")],
   [C("Promise to review the result", "subject.morale += 4", "commission -= 1", result="'We'll review it.' {He} leaves. Nobody reviews anything.", default=True),
    C("Have security carry {him} out", "subject.beef += 15", "fans -= 1", "media += 1", result="Four security guards carry {him} out like a rolled-up rug. {He} waves to the crowd the whole time.", bot=1)],
   roles={"subject": LOSE}, cond="lastLoser != '' && lastRobbery", weight=14)

FN('fn_robbery_outrage', 'ROBBERY!', [sc('fightnight', "The decision is read and the arena erupts. Fans are throwing beer at the judges' table. {subject.first} {subject.last}, who lost, is pointing at the scorecards and mouthing words the broadcast cannot air. The network is on the phone.")],
   [C("Pay {subject.last} {his} win bonus anyway", "spend('bonuses', 10000 * scale)", "subject.loyalty += 15", "fans += 3", "fighters += 2", result="'Everyone saw who won.' The fans love it. The commission does not love the implication.", ethics=1),
    C("Demand the commission review the judges", "commission -= 3", "fans += 2", "media += 1", result="The commission 'reviews' it. The result stands. The judges are reassigned to a different bad event.", default=True),
    C("Say nothing", "fans -= 3", "subject.morale -= 6", result="Silence. It's loudest at the next event.", bot=1)],
   roles={"subject": LOSE}, cond="lastRobbery", weight=18)

FN('fn_late_stoppage', 'Stoppage Review', [sc('fightnight', "The ref let that go WAY too long. {subject.first} took twelve unanswered punches after {he} was clearly out. Commentators are furious. {His} corner is screaming at the ref. The doctor is already in the cage.")],
   [C("File a formal complaint about the referee", "commission -= 2", "fighters += 3", "media += 2", "subject.loyalty += 6", result="The commission thanks you for your 'input'. The ref is assigned to the next card anyway.", ethics=1, default=True),
    C("Say nothing; refs are the commission's job", "fighters -= 2", result="{His} family watched the replay. They remember who said nothing.", bot=1)],
   roles={"subject": LOSE}, cond="lastLoser != '' && (lastMethod == 'TKO' || lastMethod == 'KO')", weight=10)

FN('fn_bonus_beg', 'Bonus Begging', [sc('fightnight', "{subject.first} uses the post-fight interview to beg for a bonus: \"I got three kids, a mortgage and a cat with diabetes. Please. The cat needs insulin, {presidentLast}.\"", "{subject.first} {subject.last}")],
   [C("Give {him} a bonus on the spot ({$fee})", "spend('bonuses', vars.fee)", "subject.loyalty += 10", "fans += 2", "fighters += 1", result="The cat gets its insulin. The cat gets a following. You get the warmest press of your career.", ethics=1),
    C("No special treatment", "subject.morale -= 4", result="{He} posts a picture of the cat looking disappointed. It's devastating.", default=True, bot=1)],
   roles={"subject": WIN}, cond="lastWinner != ''", vars={"fee": money(5, 10)}, weight=12)

FN('fn_short_notice_injury', 'Pulled Mid-Event', [sc('fightnight', "Backstage panic: a fighter on the main card just tore a hamstring warming up. {subject.first} {subject.last} has already fought tonight... and won... and says {he}'ll fight again if you double {his} money.", "{subject.first} {subject.last}")],
   [C("Let {him} fight twice", "spend('purses', 20000 * scale)", "subject.hype += 15", "subject.damage += 6", "commission -= 5", "fans += 4", result="It is wildly irresponsible and the crowd has never been louder. {He} survives. Barely.", bot=2, ethics=-2),
    C("Scrap the bout", "fans -= 1", result="A shorter card. The crowd boos. The doctor exhales.", default=True, ethics=1)],
   roles={"subject": WIN}, cond="lastWinner != '' && !lastMain", weight=4)

FN('fn_cornerman_fight', 'The Corners Go At It', [sc('fightnight', "Between rounds, {subject.last}'s coach and {other.last}'s coach started screaming at each other across the cage. Now they're both in the cage, in matching team polos, wrestling. Neither of them has trained in 20 years. It looks like two grandpas fighting over a parking space.")],
   [C("Fine both teams", "commission += 1", "media += 1", result="Both fined. Both claim victory.", default=True),
    C("Book the coaches on the next card", "fans += 4", "commission -= 3", "media -= 1", result="'COACHES' CORNER: THE GRUDGE MATCH'. They both get winded during the walkout.", bot=1)],
   roles={"subject": F("f.id == lastA"), "other": F("f.id == lastB")}, weight=6)

FN('fn_celebrity_cageside', 'Celebrity Cageside', [sc('fightnight', "A famous pop star is cageside and got splashed with blood from {subject.last}'s cut. {Her} reps are furious. {Her} fans are thrilled. {Her} outfit is now 'ruined but iconic'.".replace('{Her}', 'Her').replace('{her}', 'her'))],
   [C("Send flowers and a lifetime ticket", "media += 2", "fans += 2", result="She posts a selfie with the blood stain. Your promotion trends among 14-year-olds.", default=True),
    C("Sell the outfit at auction for charity", "earn('charity', 50000 * scale)", "media += 3", "fans += 1", result="It sells for a ridiculous amount. The pop star approves.", ethics=1)],
   roles={"subject": LOSE}, cond="lastLoser != ''", weight=6)

FN('fn_ko_celebration', 'The Celebration', [sc('fightnight', "{subject.first} celebrates the knockout by doing a backflip off the cage, landing badly, and spraining {his} ankle. It's the most injured {he}'s been all night.", "{subject.first} {subject.last}")],
   [C("Pay for the X-ray", "injure(subject, 3, 'sprained ankle (celebration)')", "spend('medical', 2000 * scale)", result="Ankle sprain. The clip of the fall has more views than the knockout.", default=True),
    C("Fine {him} for 'unsafe celebrating'", "subject.morale -= 3", "fans -= 1", result="The fans think the fine is ridiculous. They're right.")],
   roles={"subject": WIN}, cond="lastWinner != '' && (lastMethod == 'KO' || lastMethod == 'TKO')", weight=8)

FN('fn_title_tears', 'New Champion', [sc('fightnight', "{subject.first} {subject.last} is the new champion, crying uncontrollably, holding the belt like a newborn. {He} wants you to put it on {him} personally.", "{subject.first} {subject.last}")],
   [C("Wrap the belt around {his} waist", "subject.loyalty += 10", "fans += 2", "subject.hype += 5", result="You do it. You both cry. The photo is on every front page.", default=True),
    C("Let a legend do it", "fans += 3", "subject.loyalty += 5", "media += 1", result="A Hall of Famer straps it on. Everyone cries. Even the security guard.")],
   roles={"subject": WIN}, cond="lastTitle && lastWinner != ''", weight=16)

FN('fn_retire_in_cage', 'Gloves In The Center', [sc('fightnight', "{subject.first} {subject.last} lost, sat on the canvas for a moment, then took off {his} gloves and left them in the center of the cage. The arena goes quiet.", "{subject.first} {subject.last}")],
   [C("Respect it", "retire(subject)", "fans += 2", "media += 2", result="A standing ovation. {He} walks out with {his} kids. A good ending.", default=True, ethics=1),
    C("Talk {him} out of it backstage", "subject.morale -= 4", "subject.loyalty += 5", result="'Sleep on it.' {He} sleeps on it. {He} unretires before breakfast.")],
   roles={"subject": F("f.id == lastLoser && f.age >= 34")}, cond="lastLoser != ''", weight=10)

FN('fn_judge_heckled', 'Judges Under Siege', [sc('fightnight', "The judges' table is under siege. Somebody threw a nacho tray. Adelaide Bird-Brain is hiding under the table with her scorecard. The crowd is chanting 'GLASSES! GLASSES!'")],
   [C("Have security escort the judges out", "commission += 1", result="The judges leave through the loading dock. Adelaide is wearing a disguise. It's a hat.", default=True),
    C("Grab the mic and calm the crowd", "fans += 2", "media += 1", result="You give a speech about respect. Somebody throws a nacho at you. You eat it. The crowd cheers.")],
   cond="lastRobbery", weight=8)

FN('fn_dirty_cutman', 'The Cutman Controversy', [sc('fightnight', "Footage shows {subject.last}'s cutman applying 'something' to {his} cut that made the bleeding stop instantly. The other corner says it's illegal. The cutman says it's 'family recipe Vaseline'.")],
   [C("Order the substance tested", "commission += 2", "media += 1", result="It's Vaseline. Mostly. Partly something from a gas station. The result stands.", default=True),
    C("Hire that cutman for the whole promotion", "spend('cutmen', 15000 * scale)", "commission -= 2", result="The cutman now works every card. Nobody bleeds. Nobody asks.", bot=1)],
   roles={"subject": WIN}, cond="lastWinner != ''", weight=5)

FN('fn_ring_card', 'Ring Card Controversy', [sc('fightnight', "The ring card holder tripped on the cage step and fell into the commentary table. She's fine. The commentator's headset is not. The broadcast is now 90 seconds of static and Blow Hogan yelling 'SHE'S HURT! SHE'S HURT!'")],
   [C("Give her the night off with pay", "media += 1", result="She gets a standing ovation on her way out. Best reaction of the night.", default=True),
    C("Make it a highlight package", "fans += 1", "media -= 1", result="Tasteless and very popular.")],
   weight=4, cd=26)

FN('fn_parking_lot', 'Parking Lot Fight', [sc('fightnight', "After the event, {subject.first} {subject.last} got into a fight in the arena parking lot with a fan who called {him} a 'can'. The fan was also a can. It was a short fight.")],
   [C("Pay the fan to go away ({$fee})", "spend('settlements', vars.fee)", "heat += 1", result="The fan goes away. Slowly. With a new car.", bot=1),
    C("Let the police handle it", "commission -= 1", "media -= 1", "subject.hype += 3", result="No charges. Lots of footage.", default=True)],
   roles={"subject": F("(f.id == lastWinner || f.id == lastLoser) && f.traits.has('Hothead') && !f.parody")}, vars={"fee": money(5, 15)}, weight=6)
