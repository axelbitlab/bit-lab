import glob, re

files = [
    'panel/modulos/claves/vista.js',
    'panel/modulos/nucleo/iconos.js',
    'panel/modulos/nucleo/utilidades.js',
    'panel/modulos/interfaz/navegacion.js'
]

for fname in files:
    txt = open(fname).read()
    stack = []
    pairs = {')': '(', ']': '[', '}': '{'}
    in_str = None
    esc = False
    in_line_comment = False
    in_block_comment = False
    i = 0
    n = len(txt)
    while i < n:
        c = txt[i]
        if in_line_comment:
            if c == '\n':
                in_line_comment = False
            i += 1
            continue
        if in_block_comment:
            if c == '*' and i + 1 < n and txt[i+1] == '/':
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue
        if in_str:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == in_str:
                in_str = None
            i += 1
            continue
        
        # Check start of comment
        if c == '/' and i + 1 < n:
            if txt[i+1] == '/':
                in_line_comment = True
                i += 2
                continue
            elif txt[i+1] == '*':
                in_block_comment = True
                i += 2
                continue
        
        if c in ('"', "'", '`'):
            in_str = c
            i += 1
            continue
            
        if c in '([{':
            stack.append((c, i))
        elif c in ')]}':
            if not stack:
                print('Error: unexpected', c, 'at', i, 'in', fname)
                break
            prev, ppos = stack.pop()
            if pairs[c] != prev:
                print(f'Error: mismatched {c} with {prev} at {i} in {fname}')
                break
        i += 1
    else:
        if stack:
            print('Unclosed:', stack, 'in', fname)
        else:
            print(fname, 'brackets balance OK')
