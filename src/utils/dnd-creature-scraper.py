import requests
import json
import time
from bs4 import BeautifulSoup


root_page = requests.get(
    'https://www.worldanvil.com/community/rpg/system/dnd5e?template=21').text


if __name__ == "__main__":
    root_soup = BeautifulSoup(root_page, features='lxml')
    table = root_soup.find('table')
    rows = table.find('tbody').find_all('tr')
    creatures = []
    for row in rows:
        creature = requests.get(
            f"https://www.worldanvil.com/sheet/{row.find('span').text}/json").json()
        creatures.append(creature)
    with open("./data/wordanvil-creatures.json", "w", encoding='utf-8') as outfile:
        json_object = json.dump(
            creatures, outfile, indent=0)
