"""
Source for data/roster/ranked.json: parodies for every ranked UFC fighter in
data/rankings/real_snapshot.json that doesn't have a hand-written marquee entry.
Run: python3 tools/roster_full_src.py   (also links the snapshot's 'parody' ids)
Columns: real, first, last, nick, country, hometown, age, skin(0-7), hair(0-7), beard(0-4), build(0-2), style, bio
style: S striker, K kickboxer, W wrestler, G grappler/sub hunter, B brawler, P pressure, C counter
Sporting jokes only: parodies are never cast in crime / doping / abuse content.
"""
import json, os, re, hashlib

ROOT = os.path.join(os.path.dirname(__file__), '..')

R = [
 # ---- heavyweight
 ("Alexander Volkov","Alexander","Volkoff","Drago","Russia","Moscow",37,0,1,1,2,"K","Six foot seven of patient kickboxing. Has been the next big thing for so long he's now the current big thing."),
 ("Sergei Pavlovich","Sergei","Pavlovitch","The Bear Shark","Russia","Lenin-Kuban",33,0,0,2,2,"B","Ends fights so fast the broadcast has to replay the walkout to fill time."),
 ("Josh Hokit","Josh","Hokkitt","The Hokit","USA","Fresno, CA",28,1,2,1,2,"W","Former college footballer who tackles people for a living now and gets paid more for it."),
 ("Waldo Cortes Acosta","Waldo","Cortes-Acostas","Salsa Boy","Dominican Republic","Santo Domingo",34,4,1,1,2,"B","Used to drive a school bus. Now drives heavyweights into the canvas, with the same calm."),
 ("Rizvan Kuniev","Rizvan","Kunieff","The Dagestani Dozer","Dagestan (Russia)","Makhachkala",32,1,0,3,2,"W","A heavyweight who wrestles like a lightweight and eats like three."),
 ("Vitor Petrino","Vitor","Petrinho","Icao","Brazil","Belo Horizonte",28,3,1,1,2,"B","Throws every punch like he's mad at it personally."),
 ("Serghei Spivac","Serghei","Spivack","Polar Bear","Moldova","Chisinau",31,0,1,2,2,"W","Big, patient and slightly shy, until he's on top of you. Then very loud."),
 ("Ante Delija","Ante","Delijah","Pit Bull","Croatia","Pula",35,0,0,2,2,"B","Croatian heavyweight with a chin made of the Adriatic coastline."),
 # ---- light heavyweight
 ("Carlos Ulberg","Carlos","Uhlberg","Black Jag","New Zealand","Auckland",35,5,1,0,1,"K","Former model who decided faces were for punching. Including, mostly, other people's."),
 ("Khalil Rountree Jr.","Khalil","Roundtree Jr.","The War Horse","USA","Los Angeles, CA",35,6,3,1,1,"K","Trained in Thailand and came back kicking legs like they owed him money."),
 ("Navajo Stirling","Navajo","Sterling","Navy","New Zealand","Auckland",28,5,1,0,1,"K","City Kickboxing product with a jab that arrives before the bell does."),
 ("Paulo Costa","Paulo","Kosta","The Eraser","Brazil","Belo Horizonte",34,3,1,1,2,"B","Built like a statue, talks like a stand-up comedian, fights like a car crash."),
 ("Jamahal Hill","Jamahal","Hills","Sweet Dreams","USA","Grand Rapids, MI",34,6,1,2,1,"S","Southpaw who puts people to sleep and then tells them about it on his podcast."),
 ("Azamat Murzakanov","Azamat","Murzakanoff","The Professional","Russia","Nalchik",37,0,0,2,1,"P","Undefeated, unbothered and allergic to wasting a single strike."),
 ("Jan Blachowicz","Jan","Blachowitz","Polish Power","Poland","Cieszyn",43,0,1,2,1,"P","Ex-champion with legendary 'Polish Power' and an even more legendary love of cake."),
 ("Dominick Reyes","Dominick","Reyez","The Devastator","USA","Hesperia, CA",36,3,1,0,1,"C","Southpaw striker who once nearly took the throne from the GOAT and has been chasing that night since."),
 # ---- middleweight
 ("Nassourdine Imavov","Nassourdine","Imavoff","The Sniper","France","Paris",30,1,0,2,1,"C","Long, patient and precise. Picks people apart like he's paid by the inch."),
 ("Brendan Allen","Brendan","Alan","All In","USA","Beaufort, SC",30,0,1,1,1,"G","Chokes people out with the calm of a man doing his taxes."),
 ("Caio Borralho","Caio","Borralhoe","The Natural","Brazil","Sao Luis",33,3,1,1,1,"G","Undefeated in the big show for so long they ran out of ways to say 'still undefeated'."),
 ("Joe Pyfer","Joe","Pyffer","Bodybagz","USA","Philadelphia, PA",29,0,2,1,2,"B","Philly power puncher who calls himself Bodybagz and works very hard to keep the name accurate."),
 ("Gregory Rodrigues","Gregory","Rodriguez-ish","Robocop","Brazil","Duque de Caxias",33,3,0,1,2,"B","Jiu-jitsu black belt who mostly uses it as a reason not to worry about getting taken down."),
 ("Anthony Hernandez","Anthony","Hernandezz","Fluffy","USA","Dixon, CA",32,2,2,2,1,"P","Pressure, cardio and a nickname that lies to his opponents."),
 ("Christian Leroy Duncan","Christian","Leroy-Dunkin","CLD","England","Croydon",30,6,1,1,1,"K","Long English kickboxer with a spinning back fist he throws mostly to see if it works."),
 # ---- welterweight
 ("Ian Machado Garry","Ian","Machado-Gary","The Future","Ireland","Dublin",28,0,1,0,1,"K","Calls himself The Future and has a future-sized Instagram to prove it."),
 ("Carlos Prates","Carlos","Prattes","The Nightmare","Brazil","Sao Paulo",32,3,0,2,1,"K","Muay Thai assassin who knocks men out and then poses like it's a fashion shoot."),
 ("Michael Morales","Michael","Moraless","Venom-ish","Ecuador","Guayaquil",26,3,0,0,1,"S","Ecuador's undefeated hope. Hits hard, stays calm, eats rice."),
 ("Gabriel Bonfim","Gabriel","Bonfeem","Marretinha","Brazil","Rio de Janeiro",28,3,0,0,1,"G","Little hammer, big guillotine. Comes from a family that collects black belts."),
 ("Sean Brady","Sean","Bradey","The Philly Assassin","USA","Philadelphia, PA",33,0,1,1,1,"W","Wrestles you into the fence and then into a choke and then into next week."),
 ("Joaquin Buckley","Joaquin","Bucklee","New Mansa","USA","St. Louis, MO",31,6,1,0,1,"B","Famous for a spinning back kick so good the replay has its own fan club."),
 # ---- lightweight
 ("Benoit Saint Denis","Benoit","Saint-Denny","God of War","France","Nimes",30,0,1,2,1,"P","Former French special forces. Treats every round like a tactical operation with snacks."),
 ("Quillan Salkilld","Quillan","Salkild","The Thrill","Australia","Gold Coast",26,0,2,0,1,"S","Young Aussie who finishes fights before the commentators finish his name."),
 ("Mauricio Ruffy","Mauricio","Rufy","One Shot","Brazil","Rio de Janeiro",29,3,0,0,1,"K","Throws spinning wheel kicks in fights like other people throw jabs."),
 ("Salahdine Parnasse","Salahdine","Parnass","The Prince","France","Paris",28,2,0,1,1,"S","Two-belt champ from across the water who came over to prove it wasn't a fluke. It wasn't."),
 ("Mateusz Gamrot","Mateusz","Gamroth","Gamer","Poland","Kolo",35,0,0,1,1,"W","Wrestles at a pace that makes opponents check if the round is over. It isn't."),
 # ---- featherweight
 ("Movsar Evloev","Movsar","Evloeff","The Leopard","Russia","Nazran",31,0,0,2,1,"W","Undefeated, unspectacular, unbeatable. Wins rounds the way gravity wins."),
 ("Diego Lopes","Diego","Lopezz","Gold Dust","Brazil","Manaus",31,3,1,1,1,"G","Throws everything, submits from anywhere, and smiles the entire time."),
 ("Lerone Murphy","Lerone","Murphee","The Miracle","England","Manchester",34,6,0,1,1,"C","Manchester counter-puncher who makes you miss, then makes you pay, then makes you watch the replay."),
 ("Jean Silva","Jean","Silvah","Lord","Brazil","Sao Paulo",29,3,1,1,1,"B","Fighting Nerds disciple who fights like the nerds were wrong about him."),
 ("Yair Rodriguez","Yair","Rodriguezz","El Pantera","Mexico","Parral",33,2,3,0,0,"K","Kicks from angles that don't exist. Mexico's most acrobatic export."),
 ("Arnold Allen","Arnold","Alan","Almighty","England","Ipswich",32,0,1,1,1,"C","Quiet Englishman who out-points loud men for a living."),
 ("Youssef Zalal","Youssef","Zalaal","The Moroccan Devil","Morocco","Casablanca",29,2,0,1,0,"G","Came back from a pink slip to beat ranked men. Very good at not giving up."),
 ("Kevin Vallejos","Kevin","Vallejoss","El Chino","Argentina","Mar del Plata",24,2,0,0,1,"P","Young Argentine who throws in volume and talks about Messi between rounds."),
 ("Steve Garcia","Steve","Garciah","Mean Machine","USA","Albuquerque, NM",33,2,0,1,1,"B","Late bloomer who started finishing everybody in his thirties and never stopped."),
 # ---- bantamweight
 ("Song Yadong","Song","Yadongg","Kung Fu Kid","China","Harbin",28,1,0,0,1,"S","Kung fu kid grown into a power puncher. Always in fights of the night."),
 ("Mario Bautista","Mario","Bautistah","Mayhem-ish","USA","Phoenix, AZ",32,2,1,1,1,"P","Wins streaks so long they forget to rank him and then rank him."),
 ("Umar Nurmagomedov","Umar","Nurmagomedoof","The Younger","Dagestan (Russia)","Makhachkala",29,1,0,2,1,"W","Another cousin from the most dangerous family tree in sport. Striking included this time."),
 ("Cory Sandhagen","Cory","Sandhaygen","The Sandman","USA","Aurora, CO",33,0,1,0,0,"S","Throws flying knees, spinning wheel kicks and the occasional perfectly normal jab."),
 ("Aiemann Zahabi","Aiemann","Zahaabi","The Zen","Canada","Montreal, QC",37,2,0,1,1,"C","Patient Canadian counter-striker. Speaks softly, jabs often."),
 ("David Martinez","David","Martinezz","Black Spartan","Mexico","Mexico City",27,2,0,1,1,"S","Mexico's latest striker. 1ton is already calling him the greatest of all time."),
 ("Deiveson Figueiredo","Deiveson","Figueiredoh","God of War II","Brazil","Soure",37,4,1,1,1,"B","Former champion with fists like coconuts and a moustache from another century."),
 ("Marlon Vera","Marlon","Verah","Chito","Ecuador","Chone",33,3,0,1,1,"C","Starts slow, ends fast. Famous for a front kick that redecorated a face."),
 # ---- flyweight
 ("Joshua Van","Joshua","Vann","The Fearless","Myanmar","Hakha",24,2,0,0,0,"P","Youngest champion in years, throws punches like he has somewhere else to be."),
 ("Manel Kape","Manel","Kapé","Starboy","Portugal","Luanda",32,5,1,0,0,"S","Talks like a headliner, fights like one, and would like you to know both."),
 ("Brandon Royval","Brandon","Royvall","Raw Dawg","USA","Denver, CO",33,0,2,1,0,"B","Chaos merchant. Will try a flying knee, a guillotine and a backflip in one round."),
 ("Tatsuro Taira","Tatsuro","Tairah","The Best","Japan","Okinawa",25,1,0,0,0,"G","Okinawan grappler who chains submissions like he's practising origami."),
 ("Kyoji Horiguchi","Kyoji","Horiguchy","Kid Karate","Japan","Takasaki",35,1,0,0,0,"K","Karate-stance legend back for one more run. Still faster than everybody."),
 ("Lone'er Kavanagh","Lone'er","Kavanaugh","Lone Wolf","England","Liverpool",26,6,0,0,0,"S","Liverpool's undefeated flyweight with hands like a kickboxer's caffeine habit."),
 ("Asu Almabayev","Asu","Almabaeff","Zulfikar","Kazakhstan","Almaty",32,1,0,1,0,"W","Kazakh wrestler who is always, somehow, on your back."),
 ("Amir Albazi","Amir","Albazzi","The Prince","Iraq","Baghdad",31,2,0,1,0,"G","Smooth grappler with hands that surprise people who expected only grappling."),
 ("Ramazan Temirov","Ramazan","Temiroff","Gorets","Uzbekistan","Tashkent",29,1,0,1,0,"P","Pressure puncher with knockouts in the bag and more in the post."),
 # ---- women's bantamweight
 ("Joselyne Edwards","Joselyne","Edwardss","Lyne","Panama","Panama City",29,5,3,0,1,"S","Panamanian striker with long arms and a longer list of upset wins."),
 ("Norma Dumont","Norma","Dumontt","The Immortal","Brazil","Belo Horizonte",35,3,1,0,1,"C","Veteran who wins by being in the right place 400 times a fight."),
 ("Luana Santos","Luana","Santoss","Dread","Brazil","Rio de Janeiro",25,4,5,0,1,"P","Young Brazilian with dreadlocks and a takedown that arrives without notice."),
 ("Ailin Perez","Ailin","Perezz","Fiona","Argentina","Buenos Aires",31,2,1,0,1,"W","Argentine wrestler who celebrates like a footballer and wrestles like a python."),
 ("Yana Santos","Yana","Santohs","Foxy","Russia","Moscow",35,0,1,0,1,"S","Steady striker who has fought half the division and remembers all of it."),
 ("Jacqueline Cavalcanti","Jacqueline","Kavalcanti","Jac","Portugal","Lisbon",31,3,1,0,1,"S","Portuguese-based Brazilian who has never met a pressure fight she didn't enjoy."),
 ("Michelle Montague","Michelle","Montaig","The Gentle Giant","USA","Las Vegas, NV",33,0,1,0,1,"W","Big, strong and polite about it."),
 ("Melissa Croden","Melissa","Crowden","The Wildcat","Canada","Toronto, ON",30,0,1,0,1,"P","Canadian with a wild streak and a sensible gameplan, in that order."),
 ("Karol Rosa","Karol","Rozah","The Brazilian Fire","Brazil","Vila Velha",31,3,1,0,1,"P","Volume striker who throws more than the scorers can count."),
 # ---- women's flyweight
 ("Natalia Silva","Natalia","Silvah","The Dragon Lady","Brazil","Belo Horizonte",28,3,1,0,0,"K","Karate-based champion with kicks you only see on the replay."),
 ("Manon Fiorot","Manon","Fiorott","The Beast","France","Nice",35,0,1,0,1,"K","French karate star who plans fights like chess and finishes them like a hammer."),
 ("Alexa Grasso","Alexa","Grasoh","Loba","Mexico","Guadalajara",32,1,1,0,0,"S","Mexico's former queen. 1ton has her poster. Several posters."),
 ("Erin Blanchfield","Erin","Blanchfeeld","Cold Blooded","USA","Elmwood Park, NJ",26,0,1,0,0,"G","Grappling prodigy who takes backs the way other people take selfies."),
 ("Wang Cong","Wang","Kong","The Lucky Girl","China","Liaoyang",33,1,0,0,0,"S","Chinese striker with heavy hands and a very unlucky nickname for her opponents."),
 ("Jasmine Jasudavicius","Jasmine","Jasudavicious","Jas","Canada","Niagara Falls, ON",36,0,1,0,1,"W","Canadian grinder who outworks everyone and then thanks them."),
 ("Maycee Barber","Maycee","Barbor","The Future","USA","Greeley, CO",27,0,1,0,0,"P","Has been called The Future since she was a teenager. The future is now, apparently."),
 ("Tracy Cortez","Tracy","Cortezz","Tracy","USA","Phoenix, AZ",31,2,1,0,0,"W","Phoenix wrestler who wins rounds by being impossible to get away from."),
 # ---- women's strawweight
 ("Mackenzie Dern","Mackenzie","Durn","Mackenzie","USA","Phoenix, AZ",32,0,2,0,0,"G","World-class jiu-jitsu, striking that varies by the day, and armbars that do not."),
 ("Virna Jandiroba","Virna","Jandirobah","Carcara","Brazil","Serrinha",37,3,1,0,0,"G","Veteran grappler who submits people in ways the commentators have to look up."),
 ("Tatiana Suarez","Tatiana","Suarezz","Tatiana","USA","Covina, CA",34,2,1,0,1,"W","Olympic-level wrestler who puts you down and keeps you there."),
 ("Gillian Robertson","Gillian","Robertsun","The Savage","Canada","Niagara Falls, ON",30,0,1,0,0,"G","Holds records for submission wins and for being underestimated."),
 ("Yan Xiaonan","Yan","Xiaonann","Fury","China","Beijing",36,1,0,0,0,"S","Former title challenger with a jab like a woodpecker on a deadline."),
 ("Fatima Kline","Fatima","Klein","The Fatal","USA","Ewing, NJ",28,5,1,0,0,"P","Undefeated pressure fighter who doesn't believe in slow starts."),
 ("Piera Rodriguez","Piera","Rodriguezz","La Fiera","Venezuela","Caracas",33,2,1,0,0,"W","Venezuelan grinder who turns every fight into a wrestling seminar."),
 ("Denise Gomes","Denise","Gomess","Denise","Brazil","Natal",25,3,1,0,0,"B","Young Brazilian who swings first and takes questions later."),
 ("Mizuki","Mizuki","Inoue-ish","Mizuki","Japan","Tokyo",30,1,0,0,0,"G","Japanese veteran who goes by one name and one plan: get the back."),
 ("Alexia Thainara","Alexia","Thainarah","Bad Girl","Brazil","Rio de Janeiro",29,3,1,0,0,"G","Submission specialist with a perfect record and an imperfect nickname."),
]

STYLES = {"S": ["Pressure Striker"], "K": ["Kickboxer"], "W": ["Wrestler"], "G": ["Sub Hunter"], "B": ["Brawler"], "P": ["Pressure Striker"], "C": ["Counter Striker"]}
STANCE = {"S": "upright", "K": "upright", "W": "wrestler", "G": "wrestler", "B": "brawler", "P": "upright", "C": "sway"}
SIG = {"S": ["jabJabJab"], "K": ["headKick", "calfKick"], "W": ["doubleLeg", "cageGrind"], "G": ["rearNakedChoke", "guillotine"], "B": ["overhandRight"], "P": ["bodyHook"], "C": ["counterLeft"]}
TRAITS = {"S": ["Gym Rat"], "K": ["Showman"], "W": ["Loyal", "Gym Rat"], "G": ["Perfectionist"], "B": ["Hothead"], "P": ["Gym Rat"], "C": ["Shy"]}

def slug(s):
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')

def h(s, n):
    return int(hashlib.md5(s.encode()).hexdigest(), 16) % n

snap_path = os.path.join(ROOT, 'data/rankings/real_snapshot.json')
snap = json.load(open(snap_path))
pos = {}
for div, v in snap['divisions'].items():
    lst = ([v['champion']] if v.get('champion') else []) + v['ranked']
    for i, e in enumerate(lst):
        pos[e['real']] = (div, i)

out = []
by_real = {}
for (real, first, last, nick, country, home, age, skin, hair, beard, build, st, bio) in R:
    div, rank = pos[real]
    women = div.startswith('w')
    base = 91 - min(rank, 15) * 0.9  # champion ~91, #15 ~77
    def sk(k, bump=0):
        return int(max(45, min(97, base + bump + (h(real + k, 7) - 3))))
    tilt = {"S": dict(striking=6, power=2, wrestling=-6, grappling=-6), "K": dict(striking=7, power=3, wrestling=-8, grappling=-8),
            "W": dict(wrestling=7, grappling=2, striking=-5, cardio=4), "G": dict(grappling=8, wrestling=2, striking=-6, power=-4),
            "B": dict(power=7, chin=3, striking=1, fightIQ=-5, grappling=-6), "P": dict(cardio=5, striking=3, durability=2),
            "C": dict(fightIQ=6, striking=4, wrestling=-4)}[st]
    keys = ["striking", "power", "wrestling", "grappling", "cardio", "chin", "fightIQ", "durability", "heart", "weightCut"]
    skills = {k: sk(k, tilt.get(k, 0)) for k in keys}
    skills["weightCut"] = 55
    fid = slug(first + '_' + last)
    o = {
        "id": fid, "first": first, "last": last, "nick": nick, "gender": "W" if women else "M", "age": age, "division": div,
        "country": country, "hometown": home,
        "look": {"head": h(real, 4), "skin": skin, "hair": hair, "hairColor": 0 if skin > 2 else h(real + 'hc', 5), "beard": 0 if women else beard, "brows": 1, "eyes": h(real + 'e', 3),
                 "nose": h(real + 'n', 3), "ears": 1 if st in "WG" else 0, "scar": h(real + 's', 2), "tattoo": h(real + 't', 3), "build": build},
        "skills": skills, "styles": STYLES[st], "traits": TRAITS[st],
        "marquee": {"archetype": "Ranked Contender" if rank else "The Champion", "arc": "Ranked Contender"},
        "anim": {"stance": STANCE[st], "signature": SIG[st], "celebration": "none"},
        "record": {"w": 12 + h(real + 'w', 14), "l": h(real + 'l', 5), "d": 0, "nc": 0},
        "potential": min(98, max(skills.values()) + 3), "primeAge": 30, "moneyIQ": 60,
        "social": {"followers": 60000 + (16 - min(rank, 15)) * 40000, "style": "gym selfies"},
        "bio": bio, "hiddenTraits": [], "parody": real, "debutAct": 1, "startWith": "free",
    }
    out.append(o)
    by_real[real] = fid

json.dump({"note": "Parodies of the rest of the real UFC rankings (generated from tools/roster_full_src.py). Sporting jokes only.", "fighters": out},
          open(os.path.join(ROOT, 'data/roster/ranked.json'), 'w'), indent=1)
# link the snapshot
for div, v in snap['divisions'].items():
    for e in ([v['champion']] if v.get('champion') else []) + v['ranked']:
        if not e.get('parody') and e['real'] in by_real:
            e['parody'] = by_real[e['real']]
json.dump(snap, open(snap_path, 'w'), indent=1)
print(len(out), 'ranked parodies written; snapshot linked')
