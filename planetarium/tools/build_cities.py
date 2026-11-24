#!/usr/bin/env python3
"""Write data/cities.json from the hand-entered list below (name, region, lat, lon, IANA time zone).
Coordinates are city-centre values rounded to 0.01 deg (public-domain facts).
usage: python3 -I build_cities.py <planetarium/data>
"""
import json, sys, os
C = """
Richmond|Indiana, USA|39.83|-84.89|America/Indiana/Indianapolis
Indianapolis|Indiana, USA|39.77|-86.16|America/Indiana/Indianapolis
Dayton|Ohio, USA|39.76|-84.19|America/New_York
Cincinnati|Ohio, USA|39.10|-84.51|America/New_York
Columbus|Ohio, USA|39.96|-83.00|America/New_York
Cleveland|Ohio, USA|41.50|-81.69|America/New_York
Louisville|Kentucky, USA|38.25|-85.76|America/Kentucky/Louisville
Chicago|Illinois, USA|41.88|-87.63|America/Chicago
Detroit|Michigan, USA|42.33|-83.05|America/Detroit
New York|New York, USA|40.71|-74.01|America/New_York
Boston|Massachusetts, USA|42.36|-71.06|America/New_York
Philadelphia|Pennsylvania, USA|39.95|-75.17|America/New_York
Pittsburgh|Pennsylvania, USA|40.44|-80.00|America/New_York
Washington|DC, USA|38.91|-77.04|America/New_York
Atlanta|Georgia, USA|33.75|-84.39|America/New_York
Miami|Florida, USA|25.76|-80.19|America/New_York
Nashville|Tennessee, USA|36.16|-86.78|America/Chicago
St. Louis|Missouri, USA|38.63|-90.20|America/Chicago
Minneapolis|Minnesota, USA|44.98|-93.27|America/Chicago
Kansas City|Missouri, USA|39.10|-94.58|America/Chicago
New Orleans|Louisiana, USA|29.95|-90.07|America/Chicago
Houston|Texas, USA|29.76|-95.37|America/Chicago
Dallas|Texas, USA|32.78|-96.80|America/Chicago
Austin|Texas, USA|30.27|-97.74|America/Chicago
Denver|Colorado, USA|39.74|-104.99|America/Denver
Albuquerque|New Mexico, USA|35.08|-106.65|America/Denver
Salt Lake City|Utah, USA|40.76|-111.89|America/Denver
Phoenix|Arizona, USA|33.45|-112.07|America/Phoenix
Tucson|Arizona, USA|32.22|-110.97|America/Phoenix
Flagstaff|Arizona, USA|35.20|-111.65|America/Phoenix
Las Vegas|Nevada, USA|36.17|-115.14|America/Los_Angeles
Los Angeles|California, USA|34.05|-118.24|America/Los_Angeles
San Diego|California, USA|32.72|-117.16|America/Los_Angeles
San Francisco|California, USA|37.77|-122.42|America/Los_Angeles
Portland|Oregon, USA|45.52|-122.68|America/Los_Angeles
Seattle|Washington, USA|47.61|-122.33|America/Los_Angeles
Anchorage|Alaska, USA|61.22|-149.90|America/Anchorage
Fairbanks|Alaska, USA|64.84|-147.72|America/Anchorage
Honolulu|Hawaii, USA|21.31|-157.86|Pacific/Honolulu
Mauna Kea|Hawaii, USA|19.82|-155.47|Pacific/Honolulu
Toronto|Canada|43.65|-79.38|America/Toronto
Montreal|Canada|45.50|-73.57|America/Toronto
Vancouver|Canada|49.28|-123.12|America/Vancouver
Calgary|Canada|51.05|-114.07|America/Edmonton
Mexico City|Mexico|19.43|-99.13|America/Mexico_City
Havana|Cuba|23.11|-82.37|America/Havana
San Juan|Puerto Rico|18.47|-66.11|America/Puerto_Rico
Bogota|Colombia|4.71|-74.07|America/Bogota
Quito|Ecuador|-0.18|-78.47|America/Guayaquil
Lima|Peru|-12.05|-77.04|America/Lima
La Paz|Bolivia|-16.50|-68.15|America/La_Paz
Santiago|Chile|-33.45|-70.67|America/Santiago
Cerro Paranal|Chile|-24.63|-70.40|America/Santiago
Buenos Aires|Argentina|-34.60|-58.38|America/Argentina/Buenos_Aires
Sao Paulo|Brazil|-23.55|-46.63|America/Sao_Paulo
Rio de Janeiro|Brazil|-22.91|-43.17|America/Sao_Paulo
Reykjavik|Iceland|64.15|-21.94|Atlantic/Reykjavik
Dublin|Ireland|53.35|-6.26|Europe/Dublin
London|United Kingdom|51.51|-0.13|Europe/London
Greenwich|United Kingdom|51.48|0.00|Europe/London
Edinburgh|United Kingdom|55.95|-3.19|Europe/London
Lisbon|Portugal|38.72|-9.14|Europe/Lisbon
Madrid|Spain|40.42|-3.70|Europe/Madrid
Barcelona|Spain|41.39|2.17|Europe/Madrid
La Palma|Canary Islands, Spain|28.76|-17.89|Atlantic/Canary
Paris|France|48.86|2.35|Europe/Paris
Brussels|Belgium|50.85|4.35|Europe/Brussels
Amsterdam|Netherlands|52.37|4.90|Europe/Amsterdam
Berlin|Germany|52.52|13.41|Europe/Berlin
Munich|Germany|48.14|11.58|Europe/Berlin
Zurich|Switzerland|47.38|8.54|Europe/Zurich
Rome|Italy|41.90|12.50|Europe/Rome
Vienna|Austria|48.21|16.37|Europe/Vienna
Prague|Czechia|50.08|14.44|Europe/Prague
Warsaw|Poland|52.23|21.01|Europe/Warsaw
Copenhagen|Denmark|55.68|12.57|Europe/Copenhagen
Oslo|Norway|59.91|10.75|Europe/Oslo
Tromso|Norway|69.65|18.96|Europe/Oslo
Stockholm|Sweden|59.33|18.07|Europe/Stockholm
Helsinki|Finland|60.17|24.94|Europe/Helsinki
Athens|Greece|37.98|23.73|Europe/Athens
Istanbul|Turkey|41.01|28.98|Europe/Istanbul
Kyiv|Ukraine|50.45|30.52|Europe/Kyiv
Moscow|Russia|55.76|37.62|Europe/Moscow
Cairo|Egypt|30.04|31.24|Africa/Cairo
Casablanca|Morocco|33.57|-7.59|Africa/Casablanca
Lagos|Nigeria|6.52|3.38|Africa/Lagos
Accra|Ghana|5.60|-0.19|Africa/Accra
Addis Ababa|Ethiopia|9.03|38.74|Africa/Addis_Ababa
Nairobi|Kenya|-1.29|36.82|Africa/Nairobi
Johannesburg|South Africa|-26.20|28.05|Africa/Johannesburg
Cape Town|South Africa|-33.92|18.42|Africa/Johannesburg
Jerusalem|Israel|31.77|35.21|Asia/Jerusalem
Ramallah|Palestine|31.90|35.20|Asia/Hebron
Amman|Jordan|31.95|35.93|Asia/Amman
Baghdad|Iraq|33.31|44.37|Asia/Baghdad
Tehran|Iran|35.69|51.39|Asia/Tehran
Riyadh|Saudi Arabia|24.71|46.68|Asia/Riyadh
Dubai|United Arab Emirates|25.20|55.27|Asia/Dubai
Karachi|Pakistan|24.86|67.01|Asia/Karachi
Delhi|India|28.61|77.21|Asia/Kolkata
Mumbai|India|19.08|72.88|Asia/Kolkata
Bengaluru|India|12.97|77.59|Asia/Kolkata
Kathmandu|Nepal|27.72|85.32|Asia/Kathmandu
Dhaka|Bangladesh|23.81|90.41|Asia/Dhaka
Bangkok|Thailand|13.76|100.50|Asia/Bangkok
Hanoi|Vietnam|21.03|105.85|Asia/Ho_Chi_Minh
Singapore|Singapore|1.35|103.82|Asia/Singapore
Jakarta|Indonesia|-6.21|106.85|Asia/Jakarta
Manila|Philippines|14.60|120.98|Asia/Manila
Hong Kong|China|22.32|114.17|Asia/Hong_Kong
Beijing|China|39.90|116.41|Asia/Shanghai
Shanghai|China|31.23|121.47|Asia/Shanghai
Taipei|Taiwan|25.03|121.57|Asia/Taipei
Seoul|South Korea|37.57|126.98|Asia/Seoul
Tokyo|Japan|35.68|139.69|Asia/Tokyo
Osaka|Japan|34.69|135.50|Asia/Tokyo
Perth|Australia|-31.95|115.86|Australia/Perth
Alice Springs|Australia|-23.70|133.88|Australia/Darwin
Adelaide|Australia|-34.93|138.60|Australia/Adelaide
Melbourne|Australia|-37.81|144.96|Australia/Melbourne
Sydney|Australia|-33.87|151.21|Australia/Sydney
Brisbane|Australia|-27.47|153.03|Australia/Brisbane
Auckland|New Zealand|-36.85|174.76|Pacific/Auckland
Christchurch|New Zealand|-43.53|172.64|Pacific/Auckland
Suva|Fiji|-18.14|178.44|Pacific/Fiji
McMurdo Station|Antarctica|-77.85|166.67|Antarctica/McMurdo
South Pole|Antarctica|-90.00|0.00|Antarctica/McMurdo
North Pole|Arctic|90.00|0.00|UTC
Equator (0°, 0°)|Gulf of Guinea|0.00|0.00|UTC
"""
rows = []
for line in C.strip().splitlines():
    n, r, la, lo, tz = line.split('|')
    rows.append([n, r, float(la), float(lo), tz])
p = os.path.join(sys.argv[1], 'cities.json')
json.dump(rows, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'cities', os.path.getsize(p), 'bytes')
