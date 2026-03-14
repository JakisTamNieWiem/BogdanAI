import requests
import json
import time
from bs4 import BeautifulSoup

root_page = requests.get('https://dnd5e.wikidot.com/spells').text
with open('./data/spells.json', 'r') as f:
    old_spells = json.load(f)
    old_names = []
    for spell in old_spells:
        old_names.append(spell['name'].replace(' ', '-').lower())
print(old_names)
if __name__ == "__main__":
    root_soup = BeautifulSoup(root_page, features='lxml')
    spell_tables = root_soup.find('div', attrs={'class': 'yui-content'})
    spell_names = [spell['href'].split(':')[1]
                   for spell in spell_tables.find_all('a', href=True) if spell['href'].split(':')[1] not in old_names]
    spell_jsons = []
    missing = []
    for i, spell in enumerate(spell_names):
        try:
            time.sleep(0.1)
            print(spell)
            link = 'https://dnd5e.wikidot.com/spell:' + spell
            spell_soup = BeautifulSoup(
                requests.get(link).text, features='lxml')
            content = spell_soup.find('div', {'id': 'page-content'})
            data = [d.text for d in content.find_all('p')]
            at_higher_levels = None
            if any('At Higher Levels' in d for d in data):
                at_higher_levels = data.pop(4)[18:]
            stats = data[2].split('\n')
            casting_time = stats[0][14:]
            s_range = stats[1][7:]
            comp_raw = stats[2][12:]
            comp_mat, comp_som, comp_ver = str("M" in comp_raw).lower(), str(
                "S" in comp_raw).lower(), str("V" in comp_raw).lower()
            duration = stats[3][10:]

            classes = '"' + '", "'.join(data[-1][13:].split(', ')) + '"'

            lvl = 'canrip' if 'cantrip' in data[1] else data[1][0]

            name = spell_soup.find(
                'div', {'class': 'page-title page-header'}).find('span').text
            ritual = str('ritaul' in data[1]).lower()
            school = data[1].split(' ')[0].lower(
            ) if 'cantrip' in data[1] else data[1].split(' ')[1].lower()
            s_type = data[1]
            spell_string = '{'
            spell_string += f'"casting_time": "{casting_time}", "classes": [{classes}], "components": {{"material": {comp_mat}, "raw": "{comp_raw}", "somatic": {comp_som}, "verbal": {comp_ver}}}, "description": "{data[3]}", "duration": "{duration}", "level": "{lvl}", "name": "{name}", "range": "{s_range}", "ritual": {ritual}, "school": "{school}", "type": "{s_type}"'
            if at_higher_levels != None:
                spell_string += f',"higher_levels": "{at_higher_levels}"'
            spell_string += '}'
            spell_jsons.append(spell_string)
            print(json.dumps(json.loads(spell_string), indent=2))
            print(f'{i}/{len(spell_names)}')
        except IndexError:
            print('index error')
            missing.append(spell)
        except requests.exceptions.ConnectionError:
            break
        except json.decoder.JSONDecodeError:
            print('json error')
            print(data)

    print(missing)
    with open("./data/wikidot-spells.json", "w", encoding='utf-8') as outfile:
        json_object = json.dump(
            '[' + ','.join(spell_jsons) + ']', outfile, indent=0)
