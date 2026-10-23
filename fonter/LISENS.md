# Skrifter

Begge skriftene ligger på vår egen server, slik at ingen brukere sender IP-adressen sin
til Google når de åpner Clientkeep.

| Skrift | Brukes til | Opphavsrett | Lisens |
| --- | --- | --- | --- |
| Schibsted Grotesk | brødtekst og overskrifter | Copyright 2023 The Schibsted-Grotesk Project Authors | SIL Open Font License 1.1 – [OFL-schibsted-grotesk.txt](OFL-schibsted-grotesk.txt) |
| DM Mono | tall, kolonneoverskrifter og kundenummer | Copyright 2020 The DM Mono Project Authors | SIL Open Font License 1.1 – [OFL-dm-mono.txt](OFL-dm-mono.txt) |

Lisensen tillater bruk på egen server, også i et produkt som selges videre, så lenge
skriftene ikke selges for seg selv og lisensteksten følger med. Filene må derfor bli
liggende i denne mappen.

Filene er woff2 hentet fra Google Fonts 20.09.2026: Schibsted Grotesk som variabel skrift
(vekt 400–700) og DM Mono i vekt 400 og 500, hver i delsettene latin og latin-ext.
`fonter.css` peker på dem med `unicode-range`, slik at nettleseren bare laster det den
trenger. Skal skriftene oppdateres, hentes de samme filene på nytt fra
[Schibsted Grotesk](https://fonts.google.com/specimen/Schibsted+Grotesk) og
[DM Mono](https://fonts.google.com/specimen/DM+Mono).
