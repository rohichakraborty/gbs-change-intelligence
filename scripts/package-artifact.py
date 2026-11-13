"""Wrap dist-single/index.html as a claude.ai artifact page (content only, no html/head/body).
Usage: npm run build:single && python3 scripts/package-artifact.py OUT.html"""
import re, sys
html = open('dist-single/index.html', encoding='utf-8').read()
s0 = html.index('<script type="module"')
s1 = html.rindex('</script>') + len('</script>')
script, outside = html[s0:s1], html[:s0] + html[s1:]
# Exact <style> tags only (bundled libraries contain "<styleSheet" strings inside the script).
styles = re.findall(r'<style(?:\s[^>]*)?>.*?</style>', outside, re.S)
page = ('<title>GBS Change Intelligence</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">\n'
        + '\n'.join(styles) + '\n<div id="root"></div>\n' + script + '\n')
# Control characters inside JS string literals are escaped (same value, publishable text).
page = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f  �﻿]', lambda m: '\\u%04x' % ord(m.group()), page)
open(sys.argv[1], 'w', encoding='utf-8').write(page)
print('wrote', sys.argv[1], len(page.encode()), 'bytes')
