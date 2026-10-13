#!/usr/bin/env python3
"""Generate OneCall's public and bundled legal documents from one source."""
import argparse
import html
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/legal/onecall-policies.json'
WEB = ROOT / 'apps/backend/legal-web'


def escape(value):
    return html.escape(value, quote=True)


def render_block(section):
    paragraphs = ''.join('<p>' + escape(p) + '</p>' for p in section.get('paragraphs', []))
    bullets = section.get('bullets', [])
    listing = ('<ul>' + ''.join('<li>' + escape(p) + '</li>' for p in bullets) + '</ul>') if bullets else ''
    return '<section class="block"><h3>' + escape(section['heading']) + '</h3>' + paragraphs + listing + '</section>'


def document(data, selected=None):
    docs = data['documents']
    navigation = ''.join(
        '<a href="' + escape(d['id']) + '.html"' + (' aria-current="page"' if d == selected else '') + '>' + escape(d['title']) + '</a>'
        for d in docs
    )
    if selected:
        content = '<h2>' + escape(selected['title']) + '</h2><p class="intro">' + escape(selected['summary']) + '</p>'
        content += ''.join(render_block(s) for s in selected['sections'])
    else:
        content = '<h2>Choose a document</h2><div class="cards">' + ''.join(
            '<a class="card" href="' + escape(d['id']) + '.html"><h3>' + escape(d['title']) + '</h3><p>' + escape(d['summary']) + '</p><span>Read document →</span></a>'
            for d in docs
        ) + '</div>'
    email = data['contactEmail']
    subject = 'OneCall account deletion' if selected and selected['id'] == 'account-deletion' else 'OneCall privacy request'
    mail = 'mailto:' + email + '?subject=' + quote(subject)
    title = (selected['title'] + ' · ' if selected else '') + data['brand'] + ' Legal & privacy'
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + escape(title) + '</title><link rel="stylesheet" href="style.css"></head><body>\n' + \
        '<a class="skip" href="#main">Skip to document</a><header><div class="wrap"><a class="brand" href="index.html">OneCall<span>Everything you need, one call away.</span></a><p class="eyebrow">' + escape(data['status']) + '</p><h1>' + escape(data['title']) + '</h1><p>' + escape(data['subtitle']) + '</p><p class="version">Updated ' + escape(data['updated']) + ' · ' + escape(data['version']) + '</p></div></header>\n' + \
        '<div class="wrap"><aside class="notice" aria-label="Pilot status">' + escape(data['notice']) + '</aside><p class="intro">' + escape(data['introduction']) + '</p><div class="layout"><nav aria-label="Legal documents">' + navigation + '</nav><main id="main">' + content + '</main></div>\n' + \
        '<section class="contact"><h2>Contact & data requests</h2><p>You can request account deletion, access, correction or export without signing in or reinstalling the app. Requests require identity verification and manual handling; this page does not automatically delete data.</p><a class="button" href="' + escape(mail) + '">Prepare email request</a><p>Send to <a href="' + escape(mail) + '">' + escape(email) + '</a>. If an email app does not open, copy this address into your email service. Never send passwords, OTPs, NIN or bank details.</p></section>\n' + \
        '<footer><p>Reference authorities: <a href="https://ndpc.gov.ng/">Nigeria Data Protection Commission</a> · <a href="https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/">FCCPC consumer rights</a>.</p><p>Draft for the current pilot. Final business details and operational procedures require approval before public launch.</p></footer></div></body></html>\n'


def outputs(data):
    docs = data['documents']
    expected = {'privacy', 'terms', 'payments', 'consumer', 'storage', 'providers', 'account-deletion'}
    if {d['id'] for d in docs} != expected or len(docs) != len(expected):
        raise ValueError('Expected one of each OneCall legal document')
    result = {WEB / 'index.html': document(data)}
    result.update({WEB / (d['id'] + '.html'): document(data, d) for d in docs})
    result[ROOT / 'apps/mobile/assets/legal/onecall-policies.json'] = SOURCE.read_text(encoding='utf-8')
    lines = ['# OneCall — Legal & privacy', '', '**' + data['status'] + '**', '', 'Updated: ' + data['updated'], '', 'Version: ' + data['version'], '', data['notice'], '', data['introduction'], '']
    for d in docs:
        lines.extend(['## ' + d['title'], '', d['summary'], ''])
        for section in d['sections']:
            lines.extend(['### ' + section['heading'], ''])
            for p in section.get('paragraphs', []):
                lines.extend([p, ''])
            for p in section.get('bullets', []):
                lines.append('- ' + p)
            lines.append('')
    lines.extend(['Contact: ' + data['contactEmail'], ''])
    result[ROOT / 'docs/legal/ONECALL-LEGAL-DRAFT.md'] = '\n'.join(lines)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if generated documents differ')
    args = parser.parse_args()
    data = json.loads(SOURCE.read_text(encoding='utf-8'))
    for path, text in outputs(data).items():
        if args.check:
            if not path.is_file() or path.read_text(encoding='utf-8') != text:
                raise SystemExit('Regenerate legal documents: ' + str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
    print('OneCall legal documents ' + ('match the source.' if args.check else 'generated.'))


if __name__ == '__main__':
    main()
