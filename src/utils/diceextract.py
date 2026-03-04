import json, re


def extract():
	with open('C:\\Users\\noleo\\Desktop\\Programowanie\\JS\\DnDTTrackerRewrite\\data\\spells.json') as f:
		spells = json.load(f)
		count = 0
		for spell in spells:
			result = re.findall('(\d+d\d+)', spell['description'])
			if len(result) > 0:
				#print(spell['name'], result.string)
				print(spell['name'], result)
				count += 1
		print(count)
def sort():
	with open('C:\\Users\\noleo\\Desktop\\Programowanie\\JS\\DnDTTrackerRewrite\\data\\spells.json') as f:
		spells: list = json.load(f)
		spells.sort(key=lambda k: k['name'])
		print(spells)
		with open('C:\\Users\\noleo\\Desktop\\Programowanie\\JS\\DnDTTrackerRewrite\\data\\spells2.json', 'w') as f2:
			json.dump(spells, f2)
extract()