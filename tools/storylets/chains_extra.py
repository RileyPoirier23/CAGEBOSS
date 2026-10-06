"""More two-beat arcs across the whole promotion: locker room, camps, fans, media, money."""
from dsl import *

FILE = 'chains_extra'
OURS = "f.ours"


def CH(cid, steps, roles=None, cat='fighter', cond=None, cd=104, weight=7, tags=None, acts=None, vars=None):
    for i, (sid, title, scenes, choices) in enumerate(steps):
        S(FILE, sid, title, cat, scenes, choices, roles=roles, cond=cond if i == 0 else None, cd=cd, weight=weight,
          chain=cid, fu=i > 0, tags=tags, acts=acts if i == 0 else None, vars=vars)


def TWO(cid, a, b, roles=None, **kw):
    CH(cid, [a, b], roles=roles, **kw)


SUBJ = {"subject": F(OURS)}
SUBJ_BOOKED = {"subject": F(OURS + " && f.booked")}

TWO('ch_tattoo',
    ('tt_ink', 'The Face Tattoo', [sc('social', "{subject.first} got a face tattoo of {his} own record: '{subject.wins}-{subject.losses}'. It is already out of date because {he} fights on Saturday.")],
     [C("Laugh it off", "subject.hype += 4", "follow('tt_update', 5)", result="The tattoo artist offers a subscription plan for updates.", default=True),
      C("Ban face tattoos from promo shoots", "subject.morale -= 4", result="{He} wears a balaclava to every shoot in protest.")]),
    ('tt_update', 'Record Update', [sc('social', "{subject.first} went back to the tattoo parlor to update {his} face record. The artist misspelled a number. {His} face now says {he} has 'tweleve' wins.")],
     [C("Sponsor the laser removal", "spend('misc', 3000 * scale)", "subject.loyalty += 4", result="The laser hurts more than any fight.", default=True),
      C("Lean into it", "fans += 2", "subject.hype += 4", result="'Tweleve' becomes a fan chant.", bot=2)]),
    roles=SUBJ, cd=156)

TWO('ch_walkout',
    ('wo_plan', 'The Walkout Plan', [visit("{subject.first} wants a walkout with: 12 dancers, a live mariachi band, a monster truck and a cameo from {pop_celeb}. 'Big fights need big entrances.'", "{subject.first} {subject.last}")],
     [C("Approve a scaled-down version ({$fee})", "spend('production', vars.fee)", "follow('wo_night', 3)", "subject.hype += 6", result="Six dancers, no monster truck. {He} sulks for four minutes.", default=True),
      C("Approve everything ({$fee} x3)", "spend('production', vars.fee * 3)", "follow('wo_night', 3)", "subject.hype += 12", "fans += 2", result="The monster truck can't fit through the tunnel. They find another way.", bot=2)]),
    ('wo_night', 'The Entrance', [sc('fightnight', "The walkout takes eleven minutes. The mariachi band plays {pop_musician}. The crowd loses its mind. {subject.first}'s opponent has been standing in the cage for nine of those minutes and is visibly furious.")],
     [C("Fine {him} for the delay", "subject.morale -= 2", "commission += 1", result="{He} pays the fine with a check that says 'worth it' in the memo line.", default=True),
      C("Make it {his} signature", "fans += 2", "network += 1", result="Every walkout bigger than the last. The production budget weeps.", bot=2)]),
    roles={"subject": F(OURS + " && f.booked && f.traits.has('Showman')")}, vars={"fee": money(5, 15)}, cd=104)

TWO('ch_fan_tattoo',
    ('ft_fan', 'Super Fan', [sc('social', "A fan got your promotion's logo tattooed across his entire back. He wants free tickets for life. He also spelled the promotion's name wrong.")],
     [C("Give him lifetime tickets", "fans += 3", "follow('ft_back', 10)", result="He cries. You almost cry. His mother definitely cries.", default=True, ethics=1),
      C("Offer to pay for a correction", "fans += 1", result="He refuses. 'It's who I am now.'")]),
    ('ft_back', 'The Super Fan Returns', [sc('social', "Your super fan has attended every event since, front row, shirtless, back to the cage. The cameras love him. He has 300,000 followers and a manager.")],
     [C("Make him an official ambassador", "fans += 3", "media += 1", result="He takes the job very seriously. He has business cards. They're also misspelled.", default=True)]),
    cat='media', cd=208)

TWO('ch_cut_man_legend',
    ('cml_hire', 'The Legendary Cutman', [phone("Stitch McGee, the most famous cutman alive, is available. He once closed a cut with a credit card and some Vaseline. He's expensive, ornery, and 79.", "Stitch McGee's agent")],
     [C("Hire him for the roster ({$fee})", "spend('staff', vars.fee)", "follow('cml_night', 4)", "fighters += 2", result="He arrives with a tackle box from 1974. Nobody is allowed to touch it.", bot=1),
      C("Too expensive", result="He signs with a rival. Their fighters stop bleeding. Infuriating.", default=True)]),
    ('cml_night', 'Stitch Works His Magic', [sc('fightnight', "A cut that would have stopped any fight: Stitch closes it in 40 seconds between rounds while yelling about the Dodgers. The fighter wins in the next round. The doctor asks Stitch for his number.")],
     [C("Give Stitch a raise", "spend('staff', 4000 * scale)", "fighters += 2", result="Stitch says 'about time'. He is 79. It is about time.", default=True)]),
    cat='business', vars={"fee": money(20, 40)}, cd=312)

TWO('ch_reality_house',
    ('rh_cohab', 'Roommates', [sc('narration', "Two of your fighters, {subject.first} and {other.first}, are now roommates to save money. One is a neat freak. The other keeps a snake in the bathtub. They fight in six weeks. Against each other.")],
     [C("Move one of them out ({$fee})", "spend('housing', vars.fee)", result="Peace restored. The snake is relocated.", default=True, ethics=1),
      C("Film it", "network += 2", "follow('rh_blowup', 3)", "rivalry(subject, other)", result="Two cameras, one bathroom, zero chill.", bot=2)]),
    ('rh_blowup', 'The Bathtub Incident', [sc('social', "The snake escaped. It was found in {subject.first}'s gym bag. {subject.first} has accused {other.first} of 'snake warfare'. The footage is incredible.")],
     [C("Air it as fight promo", "fans += 3", "subject.hype += 8", "other.hype += 8", result="'SNAKE WARFARE' sells out the arena.", default=True, bot=2)]),
    roles={"subject": F(OURS), "other": F(OURS + " && f.id != subject.id && f.division == subject.division")}, vars={"fee": money(2, 6)}, cd=156)

TWO('ch_signature_move',
    ('sgm_invent', 'The New Move', [sc('social', "{subject.first} has invented a new move called 'The {subject.last} Special'. It's a spinning backfist into a cartwheel into a flying knee. It has never worked in sparring. {He} plans to use it Saturday.")],
     [C("Hype it", "subject.hype += 6", "fans += 1", "follow('sgm_result', 3)", result="The whole sport is watching for The Special.", bot=2, default=True),
      C("Tell {him} to keep it simple", "subject.skills.fightIQ += 1", "subject.morale -= 2", result="{He} nods. {He} is not keeping it simple.")]),
    ('sgm_result', 'The Special', [sc('headline', "THE {subject.last} SPECIAL: fighter attempts viral move in fight, results described as 'historic' by some and 'a crime against physics' by others")],
     [C("Put it on every highlight reel", "fans += 2", "subject.hype += 6", result="Kids everywhere attempt it in their backyards. Parents everywhere email you.", default=True)]),
    roles=SUBJ_BOOKED, cd=156)

TWO('ch_belt_damage',
    ('bd_dent', 'The Dented Belt', [phone("The champion dropped the title belt off a party boat. A diver recovered it. It's dented, waterlogged, and now smells like a lake.", "{subject.manager}")],
     [C("Make a new belt ({$fee})", "spend('belts', vars.fee)", "follow('bd_auction', 6)", result="A brand new belt. The old one is sitting in a bucket.", default=True),
      C("The champ keeps the lake belt", "fans += 2", "subject.morale -= 2", result="'Lake Belt' merch. Of course.", bot=2)]),
    ('bd_auction', 'Lake Belt Auction', [sc('headline', "DENTED 'LAKE BELT' AUCTIONED FOR CHARITY; WINNING BIDDER IS A FISH RESTAURANT")],
     [C("Attend the unveiling", "media += 2", "fans += 1", result="It hangs above the fish tank. Diners love it. The fish seem indifferent.", default=True)]),
    roles={"subject": F(OURS + " && f.champ")}, vars={"fee": money(10, 25)}, cd=208)

TWO('ch_trainer_split',
    ('ts_split', 'The Coach Split', [sc('headline', "{subject.last} SPLITS WITH LONGTIME COACH {subject.coach}; COACH CLAIMS FIGHTER 'STOPPED LISTENING IN 2019'")],
     [C("Help {him} find an elite camp ({$fee})", "spend('camp', vars.fee)", "subject.skills.fightIQ += 2", "follow('ts_new', 6)", result="An elite camp. With a waiting list. You pull strings.", default=True),
      C("Stay out of it", "subject.morale -= 3", "follow('ts_new', 6)", result="{He} trains alone in a garage with a tablet and a dream.")]),
    ('ts_new', 'New Camp, New Me', [sc('social', "{subject.first} posts from the new camp: new stance, new nutrition, new haircut, new catchphrase. {He} looks great. The old coach comments 'we'll see' under every post.")],
     [C("Book a statement fight", "subject.hype += 8", "fans += 1", result="If it works, the old coach eats his words. If not, he'll post them.", default=True, bot=2)]),
    roles=SUBJ, vars={"fee": money(10, 30)}, cd=156)

TWO('ch_food_truck',
    ('fd_truck', 'The Food Truck', [sc('social', "{subject.first} has opened a food truck called '{subject.nick} Bites' selling 'fighter food': chicken, rice, and a {pop_food} knockoff burger. The line is around the block.")],
     [C("Bring the truck to fight night", "fans += 2", "follow('fd_poison', 4)", result="Truck parked outside the arena. Smells incredible.", bot=2),
      C("Wish {him} luck", "subject.morale += 2", result="{He} sends you a free burger. It's genuinely great.", default=True)]),
    ('fd_poison', 'Food Truck Incident', [sc('headline', "FIGHT NIGHT FOOD TRUCK UNDER INVESTIGATION AFTER 40 FANS REPORT 'STOMACH TROUBLE'; FIGHTER-OWNER BLAMES 'THE MAYO SUPPLIER'")],
     [C("Pay the fans' medical bills", "spend('misc', 15000 * scale)", "media += 1", "fans += 1", result="Expensive mayo.", default=True, ethics=1),
      C("Distance yourself", "subject.loyalty -= 6", "media -= 1", result="'We have no relationship with the truck.' Your logo is on the truck.")]),
    roles=SUBJ, cat='weird', cd=208)

TWO('ch_haircut_bet',
    ('hb_bet', 'The Haircut Bet', [sc('social', "{subject.first} and {other.first} made a bet: the loser of their fight shaves their head on live TV. Both have exceptional hair. The hair has its own fan accounts.")],
     [C("Promote the bet", "rivalry(subject, other)", "fans += 2", "follow('hb_shave', 4)", result="'HAIR VS HAIR' posters go up everywhere.", bot=2, default=True),
      C("Ban the bet", "subject.morale -= 2", "other.morale -= 2", result="They do it anyway, privately. Neither shows up to the press conference.")]),
    ('hb_shave', 'The Shave', [sc('fightnight', "The loser sits on a stool in the center of the cage while the winner shaves them with clippers. The crowd sings. The loser cries a single tear. The hair is auctioned online for $14,000.")],
     [C("Donate the money", "media += 2", "fans += 2", result="The hair funds a youth gym. Wholesome. Bald, but wholesome.", default=True, ethics=1)]),
    roles={"subject": F(OURS + " && f.booked"), "other": F(OURS + " && f.id != subject.id && f.division == subject.division")}, cat='fightnight', cd=208)

TWO('ch_kid_fan',
    ('kf_letter', 'Letter From a Kid', [doc("Dear {subject.first}, I am 9 and you are my favorite fighter. I watch every fight with my grandpa. He says you hit like a truck. I got bullied at school and I did your move. I got suspended. Worth it. Love, Danny.", "FAN MAIL")],
     [C("Arrange for {subject.first} to visit Danny's school", "media += 3", "subject.morale += 6", "follow('kf_visit', 3)", result="{He} agrees immediately. {He} also asks about the suspension.", default=True, ethics=2),
      C("Send a signed photo", "subject.morale += 2", result="Danny frames it. Grandpa frames the envelope.")]),
    ('kf_visit', 'School Visit', [sc('headline', "{subject.last} VISITS LOCAL SCHOOL, GIVES ANTI-BULLYING TALK; BULLY REPORTEDLY 'SEEN CRYING NEAR THE MONKEY BARS'")],
     [C("Make it a program", "media += 3", "fans += 2", "spend('community', 10000 * scale)", result="The 'Fighters in Schools' program launches. Every fighter wants in. Even the scary ones.", default=True, ethics=2)]),
    roles={"subject": F(OURS + " && !f.traits.has('Hothead')")}, cat='media', cd=208)

TWO('ch_weight_scale',
    ('wsc_broken', 'The Rigged Scale?', [sc('social', "A viral video claims the official weigh-in scale reads 2 pounds light. The video is shot vertically, at night, by a man named Craig. It has 5 million views.")],
     [C("Have the scale certified ({$fee})", "spend('commission', vars.fee)", "commission += 2", "follow('wsc_result', 2)", result="An inspector with a very small hammer certifies the scale.", default=True, ethics=1),
      C("Ignore Craig", "commission -= 1", result="Craig makes four more videos. One is in Spanish.")]),
    ('wsc_result', 'Scale Results', [doc("CERTIFICATION: The official weigh-in scale is accurate to within 0.1 lb. Note: the inspector found a sandwich behind the scale. It has been removed.", "COMMISSION CERTIFICATE")],
     [C("Post the certificate", "media += 2", "commission += 1", result="Craig posts that the certificate is 'exactly what they'd want you to think'.", default=True)]),
    cat='commission', vars={"fee": money(1, 4)}, cd=208)

TWO('ch_ring_girl',
    ('rg_strike', 'Ring Card Strike', [phone("The ring card team is threatening to strike: they've been paid in 'exposure' and leftover hot dogs for a year. They have a union rep. He's very calm. That's scary.", "Ring card union rep")],
     [C("Pay them properly ({$fee})", "spend('staff', vars.fee)", "media += 2", result="They show up with new outfits and, for the first time, smiles.", default=True, ethics=2),
      C("Replace them with Juiced Butler", "fans += 1", "follow('rg_butler', 3)", result="Juiced Butler agrees immediately.", bot=1)]),
    ('rg_butler', 'Juiced Butler Holds the Card', [sc('fightnight', "Juiced Butler walks the round card in a tank top, flexing between steps. The card snaps in half from the force of his grip. Round three is announced verbally. With a 360 spin.")],
     [C("Bring back the ring card team (with raises)", "spend('staff', vars.fee)", "fans += 2", result="Everyone wins. Butler keeps the snapped card in a frame.", default=True, ethics=1),
      C("Keep Butler on cards", "fans += 2", "media -= 1", result="Round cards are now a contact sport.", bot=2)]),
    cat='business', vars={"fee": money(5, 15)}, cd=208)

TWO('ch_altitude',
    ('alt_camp', 'Altitude Camp', [sc('narration', "{subject.first} wants to train at altitude in the mountains of {subject.country}. {His} coach says it builds cardio. {His} accountant says it builds debt.")],
     [C("Fund it ({$fee})", "spend('camp', vars.fee)", "subject.skills.cardio += 3", "follow('alt_back', 6)", result="{He} sends photos of mountains and llamas.", default=True),
      C("Suggest a treadmill and a mask", "subject.morale -= 3", result="{He} trains in a hypoxic mask at the mall. Mall security has questions.")]),
    ('alt_back', 'Back From the Mountain', [sc('narration', "{subject.first} is back from altitude camp, lighter, leaner, tanned, and accompanied by a llama named Gary. Gary is now part of the team. Gary has a credential.")],
     [C("Approve Gary's credential", "fans += 2", "subject.morale += 6", result="Gary walks out with {him} on fight night. Gary has more fans than some of your champions.", default=True, bot=2)]),
    roles=SUBJ, vars={"fee": money(8, 20)}, cd=208)

TWO('ch_mma_math',
    ('mm_debate', 'MMA Math', [sc('social', "Fans on forums have used 'MMA math' to prove that a flyweight on your roster would beat {pop_athlete}, a bear, and the concept of time. The thread has 40,000 replies.")],
     [C("Post the thread on the official account", "fans += 2", "follow('mm_reply', 2)", result="The internet engages. So does {pop_athlete}.", bot=2, default=True),
      C("Ignore", result="The thread grows. It becomes sentient.")]),
    ('mm_reply', 'The Athlete Responds', [sc('social', "{pop_athlete} has responded: 'I'd beat your flyweight with one hand.' Your flyweight replied: 'Bring the hand.' This is going nowhere and getting enormous engagement.")],
     [C("Offer an exhibition (grappling only)", "fans += 3", "network += 2", result="The athlete's agent says no. The athlete says maybe. The agent says no louder.", default=True, bot=2)]),
    cat='media', cd=208)

TWO('ch_gym_fire',
    ('gf_fire', 'The Gym Fire', [phone("{subject.gym} burned down overnight. No one was hurt, but the mats, the bags and the trophy wall are gone. {subject.first} has a fight in five weeks and nowhere to train.", "{subject.coach}")],
     [C("Pay for a temporary gym ({$fee})", "spend('camp', vars.fee)", "subject.loyalty += 10", "follow('gf_rebuild', 8)", result="A warehouse with mats. It's not glamorous. It's a gym.", default=True, ethics=2),
      C("Start a fundraiser", "fans += 2", "media += 1", "follow('gf_rebuild', 8)", result="Fans raise twice what was needed. The internet can be good sometimes.", bot=1)]),
    ('gf_rebuild', 'The Rebuild', [sc('social', "{subject.gym} has reopened, bigger, with a wall dedicated to the people who helped. Your name is on it. Spelled correctly, even.")],
     [C("Attend the reopening", "media += 2", "fighters += 2", result="You cut the ribbon. {subject.first} cries. The coach hugs you for a long time.", default=True, ethics=1)]),
    roles=SUBJ, cat='family', vars={"fee": money(15, 40)}, cd=312)

TWO('ch_language',
    ('lg_trans', 'Lost in Translation', [sc('presser', "At the press conference, {subject.first}'s translator turned a polite answer into 'I will eat your children and then your children's children'. The translator has been fired. The quote is everywhere.")],
     [C("Clarify immediately", "media += 1", "subject.hype -= 2", result="The clarification gets 1% of the views.", default=True),
      C("Never clarify", "subject.hype += 10", "fans += 2", "follow('lg_legend', 4)", result="{subject.first} is now the scariest person in the sport. {He} is a gentle soul who knits.", bot=2)]),
    ('lg_legend', 'The Legend Grows', [sc('social', "Fans now believe {subject.first} is a menace. {He} keeps posting knitting videos. The internet believes the knitting is 'psychological warfare'.")],
     [C("Sell knitting kits", "earn('merch', 30000 * scale)", "fans += 2", result="They sell out. Opponents report feeling 'uneasy'.", default=True)]),
    roles={"subject": F(OURS + " && f.country != 'USA'")}, cat='media', cd=208)

TWO('ch_cardio_test',
    ('ct_test', 'The Cardio Test', [sc('social', "{subject.first} posted a 'cardio test' video running up a hill. {He} made it a third of the way, sat down, and ate a banana. {His} opponent has reposted it 400 times.")],
     [C("Hire a strength & conditioning coach ({$fee})", "spend('camp', vars.fee)", "subject.skills.cardio += 3", "follow('ct_hill', 6)", result="The S&C coach brings a whistle and no mercy.", default=True),
      C("Tell {him} to stop posting", "subject.morale -= 2", result="{He} posts about not posting.")]),
    ('ct_hill', 'The Hill, Revisited', [sc('social', "{subject.first} returns to the hill. Runs it four times. Then eats the banana at the top, staring into the camera. The opponent stops reposting.")],
     [C("Use it as the fight promo", "subject.hype += 8", "fans += 2", result="The banana becomes a symbol.", default=True, bot=2)]),
    roles=SUBJ_BOOKED, vars={"fee": money(4, 10)}, cd=156)

TWO('ch_judge_bribe_rumor',
    ('jbr_rumor', 'Judge Rumors', [sc('headline', "ANONYMOUS FORUM POST CLAIMS A {promotion} JUDGE 'TAKES STEAK DINNERS FOR SCORECARDS'; JUDGE DENIES IT, MID-STEAK")],
     [C("Ask the commission to investigate", "commission += 2", "spend('legal', 10000 * scale)", "follow('jbr_result', 4)", result="An investigation. The judge is put on leave and orders room service.", default=True, ethics=1),
      C("Dismiss it as trolling", "commission -= 2", "media -= 1", result="The forum post gets a sequel with photos of steaks.")]),
    ('jbr_result', 'Investigation Result', [doc("FINDINGS: No evidence of scorecard manipulation. Substantial evidence of steak. The judge is reminded that gifts over $50 must be declared. He has declared 41 steaks.", "COMMISSION FINDINGS")],
     [C("Publish the findings", "commission += 2", "media += 2", result="The steak memes outlive the controversy.", default=True)]),
    cat='commission', cd=312)

TWO('ch_movie_role',
    ('mv_offer', 'The Movie Role', [phone("A studio wants {subject.first} for a role in {pop_movie} 2. Six weeks of shooting. It's a 'speaking role', meaning one line: 'Not today.'", "Hollywood agent")],
     [C("Let {him} do it", "subject.followers *= 1.4", "subject.morale += 6", "follow('mv_premiere', 10)", result="{He} rehearses 'Not today' 4,000 times.", bot=2),
      C("Keep {him} in camp", "subject.morale -= 6", result="{He} watches the trailer without {him} in it. Sad.", default=True)]),
    ('mv_premiere', 'The Premiere', [sc('headline', "{subject.last} STEALS THE SHOW IN FIVE-SECOND MOVIE CAMEO; CRITICS CALL DELIVERY OF 'NOT TODAY' 'THE ONLY GOOD PART'")],
     [C("Bring the movie cast to fight night", "fans += 3", "network += 2", result="A movie star cageside. The jumbotron can't stop finding them.", default=True, bot=2)]),
    roles={"subject": F(OURS + " && f.star > 50")}, cd=208)

TWO('ch_pet',
    ('pet_dog', 'Fight Dog', [sc('social', "{subject.first} adopted a rescue dog named Rear Naked Choke ('Choke' for short). Choke attends training, sits on the apron and growls at the sparring partners. Choke has 200k followers.")],
     [C("Give Choke a credential", "fans += 2", "follow('pet_night', 4)", result="Choke's credential photo is the best ID photo in the building.", default=True, bot=1),
      C("No dogs in the arena", "subject.morale -= 3", result="Choke watches from the car. Judging you.")]),
    ('pet_night', 'Choke at Fight Night', [sc('fightnight', "Choke the dog watches the fight from the corner in a tiny {promotion} hoodie. When {subject.first} wins, Choke runs into the cage before the ref can stop him. The image is the most-shared photo of the year.")],
     [C("Make Choke an official mascot", "fans += 3", "media += 2", result="Choke gets an endorsement deal with a dog food company. More than some prelim fighters.", default=True)]),
    roles=SUBJ, cat='weird', cd=208)

TWO('ch_hometown',
    ('ht_event', 'Hometown Hero', [sc('narration', "{subject.first} wants to fight in {his} hometown of {subject.hometown}. The local arena seats 6,000. The mayor has offered a key to the city and a parade 'with a float shaped like a fist'.")],
     [C("Book a hometown event", "fans += 2", "subject.morale += 10", "follow('ht_parade', 6)", result="The whole town is buying tickets. Some are buying two.", default=True, bot=2),
      C("Not this year", "subject.morale -= 4", result="{His} mom calls you personally. It's very uncomfortable.")]),
    ('ht_parade', 'The Parade', [sc('headline', "{subject.hometown} THROWS PARADE FOR HOMETOWN FIGHTER; FIST-SHAPED FLOAT COLLIDES WITH LOCAL BAKERY, NO INJURIES, MANY CROISSANTS")],
     [C("Pay for the bakery", "spend('misc', 8000 * scale)", "media += 2", result="The bakery names a pastry after {him}. It's a fist-shaped croissant.", default=True, ethics=1)]),
    roles={"subject": F(OURS + " && f.star > 30")}, cat='business', cd=312)

TWO('ch_ai_judge',
    ('ai_pitch', 'The Robot Judge', [phone("A tech startup wants to pilot an AI judge at your events. It analyzes every strike and outputs a score in real time. It's called JudgeBot. It's 'mostly accurate'.", "Startup founder")],
     [C("Pilot it alongside the human judges", "network += 2", "follow('ai_result', 6)", result="JudgeBot sits cageside in a small plastic box. It beeps when someone gets hit.", bot=2),
      C("No robots", "commission += 1", result="The judges send you a thank-you card. And a steak.", default=True)]),
    ('ai_result', 'JudgeBot Results', [sc('headline', "JUDGEBOT DISAGREES WITH HUMAN JUDGES IN 4 OF 9 FIGHTS; FANS SIDE WITH THE ROBOT IN ALL FOUR; ONE JUDGE THREATENS TO 'UNPLUG IT PERSONALLY'")],
     [C("Push the commission to adopt it", "fans += 3", "commission -= 3", result="The commission forms a committee. The committee forms a sub-committee. JudgeBot waits.", bot=2),
      C("Retire JudgeBot", "commission += 2", result="JudgeBot is unplugged. It beeps one last time. Lon Anik says 'rest in peace'.", default=True)]),
    cat='commission', cond="act >= 3", cd=312)

TWO('ch_spit_bucket',
    ('spb_viral', 'The Spit Bucket', [sc('social', "A cornerman accidentally knocked over the spit bucket onto a front-row celebrity, {pop_celeb}. The video has 30 million views. The celebrity's publicist is drafting statements.")],
     [C("Send a heartfelt apology and new outfit", "spend('misc', 10000 * scale)", "media += 1", result="The celebrity posts the apology. And the new outfit. And a picture with the cornerman.", default=True, ethics=1),
      C("Sell 'I got spit-bucketed' shirts", "earn('merch', 20000 * scale)", "fans += 2", "media -= 1", "follow('spb_feud', 3)", result="Shirts sell out. The celebrity's publicist doesn't laugh.", bot=2)]),
    ('spb_feud', 'Celebrity Feud', [sc('social', "{pop_celeb} has called your promotion 'disgusting' on a talk show. Then said 'the fights were sick though'. Both clips are trending.")],
     [C("Invite them back, VIP", "fans += 2", "media += 2", result="They come back. They sit in row three this time.", default=True)]),
    cat='fightnight', cd=208)

TWO('ch_overtime',
    ('ot_crunch', 'Staff Burnout', [memo("Your staff worked 90-hour weeks during fight month. The matchmaker fell asleep in a meeting. The social media manager has started tweeting in her sleep.", "MEMO: HR")],
     [C("Give everyone a week off and bonuses ({$fee})", "spend('staff', vars.fee)", "fighters += 1", "follow('ot_back', 2)", result="The office is empty. Peaceful. A plant dies.", default=True, ethics=2),
      C("Pizza party", "spend('staff', 500)", "chaos += 1", result="The pizza party is noted, by HR, as 'not a solution'.", bot=1)]),
    ('ot_back', 'Recharged', [sc('narration', "Your staff are back, rested and terrifyingly productive. The matchmaker booked a perfect card in an hour. The social media manager tweeted something so good the rival promotion followed you.")],
     [C("Make it policy", "patience -= 1", "media += 1", "fighters += 1", result="Mandatory rest after fight month. The Board frowns. The work gets better.", default=True, ethics=1)]),
    cat='business', vars={"fee": money(15, 40)}, cd=208)

TWO('ch_age_lie',
    ('al_lie', 'How Old Are You Really?', [sc('social', "A fan found {subject.first}'s high school yearbook. It's from a year that would make {him} {subject.age} plus seven. {He} claims it's 'a different person with the same name and face'.")],
     [C("Investigate", "follow('al_truth', 2)", "media += 1", result="You request {his} birth certificate. It arrives laminated, which is suspicious.", default=True),
      C("Laugh it off", "fans += 2", "subject.hype += 4", result="'AGELESS' becomes {his} nickname.", bot=2)]),
    ('al_truth', 'The Real Age', [sc('headline', "IT'S TRUE: {subject.last} IS SEVEN YEARS OLDER THAN CLAIMED; FIGHTER RESPONDS 'AGE IS A STATE OF MIND' WHILE ICING BOTH KNEES")],
     [C("Celebrate it", "fans += 2", "subject.hype += 6", result="The oldest active fighter in the division gets a cake at the weigh-in.", default=True),
      C("Fine {him} for false info", "commission += 2", "subject.morale -= 6", result="{He} pays the fine and says {he}'s 'too old for this'.")]),
    roles={"subject": F(OURS + " && f.age >= 32")}, cd=312)

TWO('ch_merch_fake',
    ('mf_knock', 'Knockoff Merch', [sc('social', "Knockoff {promotion} merch is everywhere: shirts misspelling the name, hats with the logo upside down, and a 'championship belt' made of a cereal box.")],
     [C("Crack down legally ({$fee})", "spend('legal', vars.fee)", "follow('mf_result', 6)", result="Cease and desists fly. A man in Florida is very upset.", default=True),
      C("Partner with the best knockoff maker", "earn('merch', 15000 * scale)", "fans += 2", result="The cereal box belt is now official merch. Of course it is.", bot=2)]),
    ('mf_result', 'Merch Report', [memo("Official merch sales up 30% following the knockoff crackdown. The cereal box belt is now a collector's item. You own none.", "MEMO: MERCH")],
     [C("Release an official cereal box belt", "earn('merch', 25000 * scale)", "fans += 1", result="If you can't beat them.", default=True, bot=1)]),
    cat='business', vars={"fee": money(10, 25)}, cd=208)

TWO('ch_comm_rookie',
    ('cr_hire', 'The New Commentator', [phone("A former fighter wants a spot on the commentary team. He's charismatic, funny, and has never once said 'he's hurt' without the fighter actually being hurt. Blow Hogan feels threatened.", "Broadcast producer")],
     [C("Give him a trial run", "network += 1", "follow('cr_debut', 3)", result="Blow Hogan schedules a 3-hour podcast about 'loyalty'.", default=True, bot=1),
      C("The booth is full", result="He signs with a rival. He's great there. Annoyingly.")]),
    ('cr_debut', 'The Booth Debut', [sc('fightnight', "The new guy's debut: he calls a knockout three seconds before it happens. Blow Hogan says 'OH HE'S HURT' a full five seconds later. Lon Anik looks between them like a child of divorce.")],
     [C("Give him a permanent seat", "network += 2", "fans += 2", result="Four in the booth. Sandwich Cormier has to share his chicken.", default=True, bot=2),
      C("Back to the original booth", "fans += 1", result="Blow Hogan is visibly relieved. He brings everyone elk jerky.")]),
    cat='media', cd=312)


TWO('ch_sauna',
    ('sa_sauna', 'Sauna Suit Incident', [sc('narration', "{subject.first} was found asleep in a hotel sauna wearing two sauna suits, a trash bag, and a winter hat, the night before weigh-ins. Hotel staff thought {he} was 'a very large burrito'.")],
     [C("Send the doctor", "spend('medical', 3000 * scale)", "follow('sa_lesson', 2)", result="{He}'s okay. Dehydrated. Very dehydrated. Philosophically dehydrated.", default=True, ethics=1),
      C("{He} made weight, right?", "subject.damage += 2", result="{He} made weight. {He} also made a new friend: the hotel's defibrillator.", bot=1)]),
    ('sa_lesson', 'Weight Cut Seminar', [sc('narration', "You've mandated a weight-cut seminar. A sports scientist explains hydration with charts. Half the roster falls asleep. One asks if pickle juice counts as a vegetable.")],
     [C("Make it mandatory every camp", "fighters -= 1", "commission += 2", "allFighters('morale', -1)", result="Fewer weight misses. More complaining.", default=True, ethics=1)]),
    roles=SUBJ_BOOKED, cd=156)

TWO('ch_cutman_war',
    ('cw_poach', 'Cutman Poaching', [phone("A rival promotion is trying to poach your best cutman, Sal 'The Seal' Ruiz, with a car and a lifetime supply of Vaseline.", "Sal 'The Seal' Ruiz")],
     [C("Match it ({$fee})", "spend('staff', vars.fee)", "fighters += 1", result="Sal stays. Sal gets a car. Sal's car smells of Vaseline.", default=True),
      C("Let him go", "fighters -= 2", "follow('cw_cuts', 6)", result="Sal leaves with a tearful speech and all the good gauze.", bot=1)]),
    ('cw_cuts', 'Bleeding Out', [sc('headline', "{promotion} FIGHTERS LEAD THE SPORT IN DOCTOR STOPPAGES SINCE CUTMAN DEPARTURE; FANS CALL IT 'THE BLEEDING ERA'")],
     [C("Hire two new cutmen", "spend('staff', vars.fee * 1.5)", "fighters += 2", result="Two cutmen. Neither is Sal. Both are fine.", default=True)]),
    cat='business', vars={"fee": money(5, 15)}, cd=208)

TWO('ch_wedding',
    ('wd_invite', 'Wedding in the Cage', [visit("{subject.first} wants to get married in the cage after {his} next fight. The ref would officiate. Juiced Butler would announce the couple. The rings would be delivered by the ring card girl, obviously.", "{subject.first} {subject.last}")],
     [C("Yes. A thousand times yes.", "fans += 3", "follow('wd_day', 4)", result="The wedding is booked. The network is thrilled. The commission is confused.", default=True, bot=2),
      C("Maybe a normal venue?", "subject.morale -= 3", result="{He} gets married at a {pop_food}. Still trending.")]),
    ('wd_day', 'The Cage Wedding', [sc('fightnight', "{subject.first} wins, then takes off {his} gloves and proposes... no, marries, right there. Juiced Butler: 'LADIES AND GENTLEMEN... THE NEWLYWEEEEEDS!' Blow Hogan cries. Sandwich Cormier catches the bouquet.")],
     [C("Give the couple a honeymoon on the promotion", "spend('gifts', 15000 * scale)", "subject.loyalty += 12", "fans += 2", result="They honeymoon at Fight Island. Of course they do.", default=True, ethics=1)]),
    roles={"subject": F(OURS + " && f.booked && !f.married")}, cat='family', cd=312)

TWO('ch_parody_doc',
    ('pd_pitch', 'Mockumentary', [phone("A comedy streamer wants to make a mockumentary about your promotion called '{promotion}: A Real Documentary'. It's 100% satire. You'd play yourself. Badly, they hope.", "Comedy producer")],
     [C("Do it", "fans += 2", "media += 1", "follow('pd_release', 10)", result="You have to do eleven takes of 'walking into a room angrily'.", bot=2),
      C("Pass", result="They make it anyway with an actor who looks like you, but taller.", default=True)]),
    ('pd_release', 'The Mockumentary Drops', [sc('headline', "'{promotion}: A REAL DOCUMENTARY' TOPS STREAMING CHARTS; VIEWERS UNSURE WHICH PARTS ARE FAKE; {president} ALSO UNSURE")],
     [C("Embrace it", "fans += 3", "network += 2", result="Season two is greenlit. You're now a sitcom character in real life.", default=True)]),
    cat='media', cd=312)

TWO('ch_fighter_union',
    ('fu_meeting', 'The Secret Meeting', [sc('narration', "Your roster held a secret meeting at a bowling alley. They're talking about forming an association. They chose the bowling alley because 'nobody would ever look for fighters at a bowling alley'. You found out from the bowling alley.")],
     [C("Meet them halfway: health insurance for all", "spend('benefits', 60000 * scale)", "fighters += 6", "follow('fu_result', 8)", result="They vote to 'pause' the association. And bowl a celebratory game.", ethics=2, default=True),
      C("Threaten anyone involved", "fighters -= 6", "media -= 2", "follow('fu_result', 8)", result="Threats are recorded. Of course they're recorded.", bot=1, ethics=-2)]),
    ('fu_result', 'Bowling Alley Accord', [sc('headline', "FIGHTERS ANNOUNCE 'BOWLING ALLEY ACCORD' WITH {promotion}; TERMS INCLUDE INSURANCE, BETTER PAY, AND FREE SHOE RENTAL")],
     [C("Sign it", "fighters += 4", "patience -= 3", "media += 3", result="Historic. The Board hates it. The fighters frame the bowling scores.", default=True, ethics=2),
      C("Stall", "fighters -= 3", result="They keep bowling. They keep organizing.")]),
    cat='business', cond="act >= 2", cd=312)

TWO('ch_fan_fight',
    ('ff_brawl', 'Crowd Brawl', [sc('social', "A brawl broke out in section 214 during the prelims. Two men in matching {pop_brand} jerseys threw hands for six minutes. Fans say the technique was 'honestly better than the prelims'.")],
     [C("Ban them for life", "commission += 1", "media += 1", result="Banned. They start a podcast about being banned.", default=True),
      C("Offer them an amateur bout", "fans += 2", "commission -= 2", "follow('ff_bout', 4)", result="Amateur bout booked. The internet is ecstatic.", bot=2)]),
    ('ff_bout', 'Section 214 Rematch', [sc('fightnight', "The two section-214 brawlers fight on the prelims, in matching jerseys. It's a draw. They hug. They're best friends now. The crowd gives them the loudest ovation of the night.")],
     [C("Make 'Section 214' a recurring feature", "fans += 2", "commission -= 1", result="Every event, one fan fight. Sanctioned. Supervised. Absolutely deranged.", bot=2),
      C("One and done", "commission += 1", result="Good memories. No precedents.", default=True)]),
    cat='fightnight', cd=312)

TWO('ch_sponsor_tattoo',
    ('st_offer', 'Sponsor Tattoo', [phone("{pop_food} will pay {subject.first} {$fee} to get their logo tattooed on {his} back. Permanently. 'It's a forever partnership,' they say. Their last forever partnership lasted eight months.", "{subject.manager}")],
     [C("Let {him} decide", "subject.morale += 4", "follow('st_regret', 26)", result="{He} says yes before you finish the sentence.", bot=1),
      C("Advise against it", "subject.morale -= 2", result="{He} gets a temporary tattoo instead. Very sensible. Very disappointing.", default=True, ethics=1)]),
    ('st_regret', 'Sponsor Gone', [sc('social', "{pop_food} has dropped all athlete sponsorships. {subject.first} still has their logo on {his} back. {He} has started wearing a T-shirt in the cage. That's illegal.")],
     [C("Pay for a cover-up tattoo", "spend('misc', 5000 * scale)", "subject.loyalty += 6", result="The logo becomes a dragon. A dragon eating a burger. It works.", default=True, ethics=1)]),
    roles={"subject": F(OURS + " && f.moneyIQ < 50")}, vars={"fee": money(10, 40)}, cd=312)
