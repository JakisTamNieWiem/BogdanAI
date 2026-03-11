import requests
import json
import time
from bs4 import BeautifulSoup

root_page = requests.get('https://dnd5e.wikidot.com/spells').text
with open('./data/spells-unsorted.json', 'r') as f:
    old_spells = json.load(f)
    old_names = [spell['name'].replace(' ', '-').lower()
                 for spell in old_spells]
print(len(old_names))
