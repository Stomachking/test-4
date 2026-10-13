# Signal Yard

An interactive, isometric 3D map of website traffic for people who don't read analytics reports. It follows visitors from where they found you (email, ads, search, social, other sites) into the website, and shows what they do there: who leaves after one page, who signs in, which articles they read, how far they browse and who converts.

It opens on a guided tour that explains the numbers in plain language. After that, viewers can follow a single source and filter by region (APAC / EMEA / LATAM), country, device, internal vs external users, age group and date.

The page ships with **invented sample data**. Load your own Excel or CSV export from the **Numbers & glossary → Data** tab.

## Run it

It is a static site with no build step.

- **On GitHub Pages:** in the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, then choose `main` and `/ (root)`. The site appears at `https://<your-user>.github.io/<repo>/` after a minute or two.
- **Locally:** open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit `http://localhost:8000`.

Three.js, its OrbitControls and SheetJS load from public CDNs (cdnjs and jsDelivr), so the page needs an internet connection.

## Your data

Uploaded files are read in the viewer's browser and never leave their computer. Only the first sheet is used. Use one row per combination of the columns below. Only **Channel** and **Visits** are required, and each extra column switches on another part of the map.

| Column | What it does |
|---|---|
| Date | Enables the day slider and Play. Use `2026-09-03` to avoid day/month mix-ups. |
| Channel | Adobe names (Natural Search, Paid Search, Display, Email, Direct, Social Networks, Referring Domains) or plain ones (Organic, SEO, PPC, Programmatic, Social, Referral). |
| Region | APAC, EMEA, LATAM. Filled in from Country when missing. |
| Country | Country name. |
| Device | Desktop, Mobile, Tablet. Adobe's "Mobile Phone" and "Other" are mapped. |
| User type | Internal or External. |
| Age group | Any labels, such as 25-34. |
| Reach | Emails sent, ad or search impressions, or social reach. Drives the outside funnel. |
| Opens | Email opens. |
| Visits | Required. "Sessions" also works. |
| Bounces | Visits that saw one page. Drives the first exit. |
| Logins | Visits that signed in. Drives the sign-in desk. |
| Page views | Drives the browsing corridor. |
| Read: *article title* | One column per article. The three most read get a room. |
| Conversions | Purchases, sign-ups or leads. "Orders" and "Leads" also work. |

`sample-data/sample-week.csv` is one week of the built-in sample in this format. It is a working example to copy.

Sent, opened and impression figures come from your email and ad platforms, not from Adobe Analytics, which only sees people once they reach the site. The in-page glossary explains where each figure comes from in Adobe.

## Where things are

| File | Contents |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Colours (light theme tokens at the top), layout and type |
| `js/data.js` | Channel definitions, file import and column matching, the sample data generator, filtering |
| `js/story.js` | The guided tour text, written from the filtered numbers |
| `js/app.js` | The 3D scenes, walkers, camera moves, filters and side panel |

To rename the articles or change the sample numbers, edit `makeSample()` in `js/data.js`. To change the tour wording, edit `js/story.js`.
