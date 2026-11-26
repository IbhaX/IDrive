"""About, Privacy, Terms and Install pages (English and Malayalam).

Kept in code rather than JSON because they are prose with a few settings
mixed in (contact email, Play link). Everything here describes what the app
actually does - update it whenever data handling changes.
"""

from __future__ import annotations

import html
from typing import Optional

from app.config import get_settings

UPDATED = "2026-11-27"


def _e(s: str) -> str:
    return html.escape(s, quote=True)


def _contact(lang: str) -> str:
    mail = get_settings().contact_email
    if not mail:
        return ""
    m = _e(mail)
    if lang == "ml":
        return f'<h2>ബന്ധപ്പെടുക</h2><p>ചോദ്യങ്ങൾക്കും തിരുത്തലുകൾക്കും: <a href="mailto:{m}">{m}</a></p>'
    return f'<h2>Contact</h2><p>Questions and corrections: <a href="mailto:{m}">{m}</a></p>'


def _about(lang: str) -> tuple[str, str, str]:
    if lang == "ml":
        t = "iDrive-നെക്കുറിച്ച്"
        d = "iDrive ഇന്ത്യയ്ക്കും കേരളത്തിനുമുള്ള സൗജന്യ, സ്വതന്ത്ര ഡ്രൈവിങ് തിയറി പഠന ഉപകരണമാണ്. ഇത് ഒരു സർക്കാർ സേവനമല്ല."
        b = f"""<h1>{t}</h1><p class="answer">{d}</p>
<h2>iDrive എന്താണ്</h2><p>റോഡ് ചിഹ്നങ്ങൾ, ഗതാഗത നിയമങ്ങൾ, അപകട തിരിച്ചറിവ്, വാഹന ശാസ്ത്രം എന്നിവ ലളിതമായി വിശദീകരിക്കുന്ന ഒരു സംവേദനാത്മക സ്കൂൾ. എല്ലാ വിശദീകരണവും ഇംഗ്ലീഷിലും മലയാളത്തിലും ലഭ്യമാണ്. ലേണേഴ്സ് ലൈസൻസ് ടെസ്റ്റിന് തയ്യാറെടുക്കാനും സുരക്ഷിതമായി ഓടിക്കാൻ പഠിക്കാനും ഇത് സഹായിക്കുന്നു.</p>
<h2>iDrive എന്തല്ല</h2><p>iDrive ഏതെങ്കിലും സർക്കാർ, RTO, മോട്ടോർ വാഹന വകുപ്പ്, Parivahan എന്നിവയുമായി ബന്ധപ്പെട്ടതല്ല. ഇവിടത്തെ മോക്ക് ടെസ്റ്റുകൾ പരിശീലനത്തിന് മാത്രമാണ്; ഔദ്യോഗിക ടെസ്റ്റ് അല്ല. ലൈസൻസ് അപേക്ഷകൾക്കും ഔദ്യോഗിക നിയമങ്ങൾക്കും സർക്കാർ സൈറ്റുകൾ നോക്കുക. iDrive ഒരു ഡ്രൈവിങ് പരിശീലകനോ റോഡിലെ പരിശീലനമോ മാറ്റിസ്ഥാപിക്കുന്നില്ല.</p>
<h2>ഉള്ളടക്കം എങ്ങനെ തയ്യാറാക്കുന്നു</h2><p>നിയമപരമായ പ്രസ്താവനകൾ പ്രസിദ്ധീകരിച്ച വിജ്ഞാപനങ്ങളെയും ചട്ടങ്ങളെയും ആധാരമാക്കിയതാണ്; ഓരോന്നിനും ഉറവിടവും പരിശോധിച്ച തീയതിയും പാഠത്തിൽ കാണിക്കുന്നു. പിഴത്തുകകൾ മാറിക്കൊണ്ടിരിക്കുന്നതിനാൽ ഞങ്ങൾ അവ പ്രസിദ്ധീകരിക്കുന്നില്ല. "റോഡിൽ നിന്ന്" കഥകൾ ഉദാഹരണങ്ങൾ മാത്രമാണ്. AI ഇൻസ്ട്രക്ടറുടെ ഉത്തരങ്ങൾ iDrive പാഠങ്ങളെ ആധാരമാക്കിയതാണെങ്കിലും തെറ്റാകാം - പ്രധാനപ്പെട്ട കാര്യങ്ങൾ ഉറവിടത്തിൽ പരിശോധിക്കുക.</p>
<p>ഒരു തെറ്റ് കണ്ടാൽ ദയവായി അറിയിക്കുക; ഞങ്ങൾ അത് തിരുത്തും.</p>{_contact(lang)}"""
        return t, d, b
    t = "About iDrive"
    d = "iDrive is a free, independent driving-theory study tool for India and Kerala. It is not a government service."
    b = f"""<h1>{t}</h1><p class="answer">{d}</p>
<h2>What iDrive is</h2><p>An interactive school that explains road signs, traffic rules, hazard perception and vehicle science in plain language, with every explanation in English and Malayalam. It helps you prepare for the learner licence test and, more importantly, to drive safely.</p>
<h2>What iDrive is not</h2><p>iDrive is not affiliated with any government, RTO, Motor Vehicles Department or Parivahan. The mock tests here are practice only, not the official test. For licence applications and the official text of the law, use the government sites. iDrive does not replace a driving instructor or supervised practice on the road.</p>
<h2>How the content is made</h2><p>Legal statements are based on published notifications and rules; each one shows its source and the date it was last checked, inside the lesson. We do not publish fine amounts, because they change. "From the road" stories are illustrative. The AI instructor's answers are grounded in iDrive's lessons but can still be wrong - check anything important against the source.</p>
<p>If you find a mistake, please tell us and we will correct it.</p>{_contact(lang)}"""
    return t, d, b


def _privacy(lang: str) -> tuple[str, str, str]:
    s = get_settings()
    ga = bool(s.ga_measurement_id or s.ads_id)
    if lang == "ml":
        t = "സ്വകാര്യതാ നയം"
        d = "iDrive നിങ്ങളെക്കുറിച്ച് എന്ത് വിവരങ്ങൾ സൂക്ഷിക്കുന്നു, എന്തിന്, മറ്റാരൊക്കെ കാണുന്നു, അക്കൗണ്ടും വിവരങ്ങളും എങ്ങനെ ഇല്ലാതാക്കാം."
        an = ("<h2>അനലിറ്റിക്സ്</h2><p>സൈറ്റ് എങ്ങനെ ഉപയോഗിക്കപ്പെടുന്നു എന്ന് മനസ്സിലാക്കാനും പരസ്യങ്ങളുടെ ഫലം അളക്കാനും ഞങ്ങൾ Google Analytics / Google Ads ഉപയോഗിക്കുന്നു. ഇവ Google-ന്റെ കുക്കികൾ വെക്കുകയും സന്ദർശിച്ച പേജുകൾ, ഉപകരണ തരം, ഏകദേശ സ്ഥലം തുടങ്ങിയവ Google-ലേക്ക് അയക്കുകയും ചെയ്യുന്നു. ഒരു പരസ്യത്തിലൂടെയാണ് വന്നതെങ്കിൽ ആ ക്ലിക്ക് ഐഡി നിങ്ങളുടെ ബ്രൗസറിലും (അക്കൗണ്ട് ഉണ്ടാക്കിയാൽ) അക്കൗണ്ടിനൊപ്പവും സൂക്ഷിക്കുന്നു.</p>"
              if ga else "<h2>അനലിറ്റിക്സ്</h2><p>iDrive നിലവിൽ അനലിറ്റിക്സോ പരസ്യ ട്രാക്കിങ്ങോ ഉപയോഗിക്കുന്നില്ല. ഇത് മാറിയാൽ ഈ പേജ് ആദ്യം പുതുക്കും.</p>")
        b = f"""<h1>{t}</h1><p class="answer">{d} അവസാനം പുതുക്കിയത്: {UPDATED}.</p>
<h2>അക്കൗണ്ട് ഇല്ലാതെ</h2><p>സൈൻ ഇൻ ചെയ്യാതെ ഉപയോഗിക്കുമ്പോൾ നിങ്ങളുടെ പുരോഗതി, ഭാഷ, തീം എന്നിവ നിങ്ങളുടെ ബ്രൗസറിൽ (local storage) മാത്രം സൂക്ഷിക്കുന്നു. ഓഫ്‌ലൈൻ ഉപയോഗത്തിനായി പാഠങ്ങൾ ബ്രൗസർ കാഷിൽ സൂക്ഷിക്കുന്നു. ഞങ്ങളുടെ സെർവർ സാധാരണ വെബ് സെർവർ ലോഗുകൾ (IP വിലാസം, അഭ്യർത്ഥിച്ച പേജ്, സമയം) സൂക്ഷിക്കുന്നു; ദുരുപയോഗം തടയാനും പ്രശ്നങ്ങൾ പരിഹരിക്കാനും മാത്രം.</p>
<h2>അക്കൗണ്ട് ഉണ്ടാക്കിയാൽ</h2><ul><li>ഇമെയിൽ വിലാസവും പേരും.</li><li>പാസ്‌വേഡ് - ഹാഷ് ചെയ്ത രൂപത്തിൽ മാത്രം; യഥാർത്ഥ പാസ്‌വേഡ് ഞങ്ങൾ കാണുന്നില്ല.</li><li>സൈൻ-ഇൻ സെഷനുകൾ (ഹാഷ് ചെയ്ത ടോക്കൺ, ബ്രൗസർ വിവരം, കാലാവധി).</li><li>പഠന പുരോഗതി - പൂർത്തിയാക്കിയ പാഠങ്ങൾ, ക്വിസ് സ്കോറുകൾ, ബുക്ക്മാർക്കുകൾ - ഉപകരണങ്ങൾ തമ്മിൽ സമന്വയിപ്പിക്കാൻ.</li><li>മോക്ക് ടെസ്റ്റ് പേപ്പറുകളും ഫലങ്ങളും.</li></ul>
<h2>അക്കൗണ്ട് ആർക്കൊക്കെ കാണാം</h2><p>സേവനം നടത്താനും ദുരുപയോഗം തടയാനുമായി iDrive അഡ്മിനിസ്ട്രേറ്റർമാർക്ക് നിങ്ങളുടെ പേര്, ഇമെയിൽ, സൈൻ-ഇൻ രീതി, ചേർന്നതും അവസാനം സൈൻ ഇൻ ചെയ്തതുമായ സമയം, പുരോഗതിയുടെയും ടെസ്റ്റ് ഫലങ്ങളുടെയും ചുരുക്കം എന്നിവ കാണാം. അവർക്ക് ഒരു അക്കൗണ്ട് തടയാനും എല്ലാ ഉപകരണങ്ങളിൽ നിന്നും സൈൻ ഔട്ട് ചെയ്യാനും ഇല്ലാതാക്കാനും കഴിയും. പാസ്‌വേഡ് അവർക്കും കാണാനാവില്ല.</p>
<h2>Google സൈൻ-ഇൻ</h2><p>Google ഉപയോഗിച്ച് സൈൻ ഇൻ ചെയ്യുമ്പോൾ Google നിങ്ങളുടെ ഇമെയിലും പേരും ഞങ്ങൾക്ക് നൽകുന്നു. Google-ന്റെ സ്വന്തം സ്വകാര്യതാ നയം അവിടെ ബാധകമാണ്.</p>
<h2>AI ഇൻസ്ട്രക്ടർ</h2><p>AI ഇൻസ്ട്രക്ടറോട് ചോദിക്കുന്ന ചോദ്യം, ബന്ധപ്പെട്ട iDrive പാഠഭാഗങ്ങൾക്കൊപ്പം ഉത്തരം തയ്യാറാക്കാനായി OpenRouter വഴി ഒരു AI മോഡൽ ദാതാവിന് അയക്കുന്നു. നിങ്ങളുടെ പേരോ ഇമെയിലോ അയക്കുന്നില്ല. ചോദ്യങ്ങളിൽ വ്യക്തിപരമായ വിവരങ്ങൾ ഉൾപ്പെടുത്തരുത്.</p>
{an}
<h2>ഞങ്ങൾ ചെയ്യാത്തത്</h2><p>നിങ്ങളുടെ വിവരങ്ങൾ ഞങ്ങൾ വിൽക്കുന്നില്ല. സേവനം നടത്താൻ ആവശ്യമുള്ളതിനപ്പുറം ആരുമായും പങ്കിടുന്നില്ല.</p>
<h2>നിങ്ങളുടെ വിവരങ്ങൾ ഇല്ലാതാക്കൽ</h2><p>സൈൻ ഇൻ ചെയ്ത് “പുരോഗതി” പേജിലെ “അക്കൗണ്ട് ഇല്ലാതാക്കുക” ഉപയോഗിക്കുക. നിങ്ങളുടെ അക്കൗണ്ട്, സെഷനുകൾ, പുരോഗതി എന്നിവ ഉടനെ ഇല്ലാതാകും; ടെസ്റ്റ് ഫലങ്ങളിൽ നിന്ന് നിങ്ങളുമായുള്ള ബന്ധം നീക്കം ചെയ്യും. ബ്രൗസറിലെ വിവരങ്ങൾ ബ്രൗസർ ക്രമീകരണങ്ങളിൽ നിന്ന് സൈറ്റ് ഡാറ്റ മായ്ച്ച് നീക്കാം.</p>{_contact(lang)}"""
        return t, d, b
    t = "Privacy policy"
    d = "What iDrive stores about you, why it is needed, who else sees it, and how to delete your account and data."
    an = ("<h2>Analytics</h2><p>We use Google Analytics / Google Ads to understand how the site is used and to measure our ads. They set Google cookies and send Google the pages you visit, your device type and approximate location. If you arrived from an ad, the ad click id is kept in your browser and, if you create an account, with your account.</p>"
          if ga else "<h2>Analytics</h2><p>iDrive does not currently use analytics or ad tracking. If that changes, this page will be updated first.</p>")
    b = f"""<h1>{t}</h1><p class="answer">{d} Last updated: {UPDATED}.</p>
<h2>Without an account</h2><p>If you use iDrive without signing in, your progress, language and theme are kept only in your browser (local storage), and lessons are cached in your browser for offline use. Our server keeps ordinary web server logs (IP address, page requested, time) to prevent abuse and fix problems.</p>
<h2>If you create an account</h2><ul><li>Your email address and name.</li><li>Your password - only as a salted hash; we never see the password itself.</li><li>Sign-in sessions (a hashed token, your browser's user agent, and an expiry).</li><li>Your learning progress - lessons completed, quiz scores, bookmarks - so it syncs across devices.</li><li>Mock test papers and results.</li></ul>
<h2>Who can see your account</h2><p>To run the service and deal with abuse, iDrive administrators can see your name, email, how you sign in, when you joined and last signed in, and a summary of your progress and test results. They can block an account, sign it out on every device, or delete it. They cannot see your password either.</p>
<h2>Google sign-in</h2><p>If you sign in with Google, Google shares your email and name with us. Google's own privacy policy applies to that step.</p>
<h2>AI instructor</h2><p>A question you ask the AI instructor is sent, with the relevant iDrive lesson extracts, through OpenRouter to an AI model provider to write the answer. Your name and email are not sent. Please don't put personal details in questions.</p>
{an}
<h2>What we don't do</h2><p>We do not sell your data, and we do not share it with anyone beyond what is needed to run the service.</p>
<h2>Deleting your data</h2><p>Sign in and use “Delete account” on the Progress page. Your account, sessions and progress are deleted immediately, and your test results are detached from you. Data in your browser can be removed by clearing site data in your browser settings.</p>{_contact(lang)}"""
    return t, d, b


def _terms(lang: str) -> tuple[str, str, str]:
    if lang == "ml":
        t = "ഉപയോഗ നിബന്ധനകൾ"
        d = "iDrive പഠനത്തിനുള്ള ഒരു സൗജന്യ സഹായിയാണ്; ഔദ്യോഗിക നിയമോപദേശമോ ലൈസൻസ് ടെസ്റ്റോ അല്ല."
        b = f"""<h1>{t}</h1><p class="answer">{d} അവസാനം പുതുക്കിയത്: {UPDATED}.</p>
<h2>പഠനത്തിന് മാത്രം</h2><p>iDrive-ലെ ഉള്ളടക്കം വിദ്യാഭ്യാസ ആവശ്യത്തിനുള്ളതാണ്. ഞങ്ങൾ കൃത്യത ഉറപ്പാക്കാൻ ശ്രമിക്കുന്നുണ്ടെങ്കിലും നിയമങ്ങളും വിജ്ഞാപനങ്ങളും മാറാം. ഔദ്യോഗിക വിവരങ്ങൾക്ക് സർക്കാർ ഉറവിടങ്ങളെയും റോഡിൽ സ്ഥാപിച്ചിട്ടുള്ള ചിഹ്നങ്ങളെയും ആശ്രയിക്കുക. റോഡിലെ നിങ്ങളുടെ തീരുമാനങ്ങൾക്ക് നിങ്ങൾ തന്നെയാണ് ഉത്തരവാദി.</p>
<h2>മോക്ക് ടെസ്റ്റുകൾ</h2><p>മോക്ക് ടെസ്റ്റിൽ ജയിക്കുന്നത് ഔദ്യോഗിക ടെസ്റ്റിൽ ജയിക്കുമെന്ന് ഉറപ്പ് നൽകുന്നില്ല.</p>
<h2>AI ഉത്തരങ്ങൾ</h2><p>AI ഇൻസ്ട്രക്ടറുടെ ഉത്തരങ്ങൾ തെറ്റാകാം. പ്രധാനപ്പെട്ട കാര്യങ്ങൾ ഉറവിടങ്ങളിൽ പരിശോധിക്കുക.</p>
<h2>അക്കൗണ്ട്</h2><p>ഒരാൾക്ക് ഒരു അക്കൗണ്ട് ഉപയോഗിക്കുക, പാസ്‌വേഡ് സുരക്ഷിതമായി സൂക്ഷിക്കുക. സേവനം ദുരുപയോഗം ചെയ്യുകയോ (ഉദാ. ഓട്ടോമേറ്റഡ് സ്ക്രാപ്പിങ്, മറ്റുള്ളവരുടെ ഉപയോഗം തടസ്സപ്പെടുത്തൽ) ചെയ്താൽ അക്കൗണ്ട് നിർത്തിവെക്കാം. എപ്പോൾ വേണമെങ്കിലും നിങ്ങൾക്ക് അക്കൗണ്ട് ഇല്ലാതാക്കാം.</p>
<h2>ഉള്ളടക്കം</h2><p>iDrive-ന്റെ പാഠങ്ങളും ചിത്രീകരണങ്ങളും സ്വന്തം പഠനത്തിനായി ഉപയോഗിക്കാം. ലിങ്ക് നൽകി ഉദ്ധരിക്കുന്നത് സ്വാഗതം. 3D കാർ മോഡൽ Khronos Group-ന്റേതാണ് (CC BY 4.0).</p>
<h2>മാറ്റങ്ങൾ</h2><p>ഈ നിബന്ധനകൾ മാറിയേക്കാം; മാറ്റം വരുമ്പോൾ മുകളിലെ തീയതി പുതുക്കും.</p>{_contact(lang)}"""
        return t, d, b
    t = "Terms of use"
    d = "iDrive is a free study aid. It is not legal advice and not the official licence test."
    b = f"""<h1>{t}</h1><p class="answer">{d} Last updated: {UPDATED}.</p>
<h2>For learning only</h2><p>iDrive's content is for education. We work to keep it accurate, but laws and notifications change. Rely on official government sources and on the signs actually posted on the road. You are responsible for how you drive.</p>
<h2>Mock tests</h2><p>Passing a mock test here does not guarantee passing the official test.</p>
<h2>AI answers</h2><p>The AI instructor can be wrong. Check anything important against the sources.</p>
<h2>Your account</h2><p>Use one account per person and keep your password safe. We may suspend accounts that abuse the service (for example automated scraping or disrupting others). You can delete your account at any time.</p>
<h2>Content</h2><p>You may use iDrive's lessons and illustrations for your own study, and you are welcome to quote them with a link. The 3D car model is by the Khronos Group (CC BY 4.0).</p>
<h2>Changes</h2><p>These terms may change; the date above is updated when they do.</p>{_contact(lang)}"""
    return t, d, b


def _install(lang: str) -> tuple[str, str, str]:
    play = get_settings().play_store_url
    if lang == "ml":
        t = "iDrive ഇൻസ്റ്റാൾ ചെയ്യുക"
        d = "iDrive ഫോണിലോ കമ്പ്യൂട്ടറിലോ ആപ്പായി ഇൻസ്റ്റാൾ ചെയ്യാം; ഇൻസ്റ്റാൾ ചെയ്ത ശേഷം പാഠങ്ങൾ ഓഫ്‌ലൈനിലും ലഭ്യമാണ്."
        p = f'<h2>Android - Google Play</h2><p><a class="btn" href="{_e(play)}" rel="noopener">Google Play-യിൽ നേടുക</a></p>' if play else ""
        b = f"""<h1>{t}</h1><p class="answer">{d}</p>{p}
<h2>Android (Chrome)</h2><ol><li>Chrome-ൽ idrive.ibhax.com തുറക്കുക.</li><li>മുകളിലെ ഇൻസ്റ്റാൾ ബട്ടൺ അല്ലെങ്കിൽ ⋮ മെനുവിലെ “ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യുക” തിരഞ്ഞെടുക്കുക.</li></ol>
<h2>iPhone, iPad (Safari)</h2><ol><li>Safari-യിൽ സൈറ്റ് തുറക്കുക.</li><li>ഷെയർ ബട്ടൺ അമർത്തി “Add to Home Screen” തിരഞ്ഞെടുക്കുക.</li></ol>
<h2>കമ്പ്യൂട്ടർ (Chrome, Edge)</h2><p>വിലാസ ബാറിലെ ഇൻസ്റ്റാൾ ഐക്കൺ ക്ലിക്ക് ചെയ്യുക. Mac Safari-യിൽ File › Add to Dock.</p>"""
        return t, d, b
    t = "Install iDrive"
    d = "Install iDrive as an app on your phone or computer; once installed, lessons also work offline."
    p = f'<h2>Android - Google Play</h2><p><a class="btn" href="{_e(play)}" rel="noopener">Get it on Google Play</a></p>' if play else ""
    b = f"""<h1>{t}</h1><p class="answer">{d}</p>{p}
<h2>Android (Chrome)</h2><ol><li>Open idrive.ibhax.com in Chrome.</li><li>Tap the install button at the top, or “Install app” in the ⋮ menu.</li></ol>
<h2>iPhone and iPad (Safari)</h2><ol><li>Open the site in Safari.</li><li>Tap Share, then “Add to Home Screen”.</li></ol>
<h2>Computer (Chrome, Edge)</h2><p>Click the install icon in the address bar. In Safari on a Mac, use File › Add to Dock.</p>"""
    return t, d, b


_PAGES = {"about": _about, "privacy": _privacy, "terms": _terms, "install": _install}


def render(name: str, lang: str) -> Optional[tuple[str, str, str]]:
    fn = _PAGES.get(name)
    return fn("ml" if lang == "ml" else "en") if fn else None
