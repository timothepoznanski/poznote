#!/bin/bash

# CSP Testing Script for Poznote (FIXED)
# Properly handles missing CSP and avoids false strict-mode detection

echo "================================================"
echo "Poznote CSP Configuration Test"
echo "================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# URL argument
if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: $0 <url>${NC}"
    echo "Example: $0 https://poznote.example.com"
    exit 1
fi

URL="$1"

echo "Testing: $URL"
echo ""

# Fetch headers once
HEADERS=$(curl -s -I "$URL")

# --------------------------------------------------
# Test 1: CSP header presence
# --------------------------------------------------
echo -e "${YELLOW}[1/5] Checking for CSP header...${NC}"

CSP_HEADER=$(echo "$HEADERS" | grep -i "^Content-Security-Policy:")

if [ -n "$CSP_HEADER" ]; then
    echo -e "${GREEN}✓ CSP header found${NC}"
    echo "   $CSP_HEADER"
    CSP_PRESENT=true
else
    echo -e "${RED}✗ No CSP header found${NC}"
    echo "   Add CSP header to NGINX / Nginx Proxy Manager"
    CSP_PRESENT=false
fi
echo ""

# --------------------------------------------------
# Test 2: CSP strictness (only if CSP exists)
# --------------------------------------------------
echo -e "${YELLOW}[2/5] Checking CSP strictness...${NC}"

if [ "$CSP_PRESENT" = false ]; then
    echo -e "${RED}✗ No CSP → strictness cannot be evaluated${NC}"
else
    if echo "$CSP_HEADER" | grep -qi "unsafe-inline"; then
        echo -e "${YELLOW}⚠ Permissive: allows unsafe-inline${NC}"
    else
        echo -e "${GREEN}✓ No unsafe-inline${NC}"
    fi

    if echo "$CSP_HEADER" | grep -qi "unsafe-eval"; then
        echo -e "${YELLOW}⚠ Permissive: allows unsafe-eval${NC}"
        echo "   Needed for Mermaid / Excalidraw / Swagger"
    else
        echo -e "${GREEN}✓ No unsafe-eval${NC}"
    fi
fi
echo ""

# --------------------------------------------------
# Test 3: Other security headers
# --------------------------------------------------
echo -e "${YELLOW}[3/5] Checking other security headers...${NC}"

check_header() {
    local name="$1"
    local expected="$2"
    local header=$(echo "$HEADERS" | grep -i "^$name:")

    if [ -n "$header" ]; then
        echo -e "${GREEN}✓ $name present${NC}"
        if [ -n "$expected" ] && ! echo "$header" | grep -qi "$expected"; then
            echo -e "${YELLOW}   Suggested value: $expected${NC}"
        fi
    else
        echo -e "${RED}✗ $name missing${NC}"
        [ -n "$expected" ] && echo "   Recommended: $expected"
    fi
}

check_header "X-Frame-Options" "SAMEORIGIN"
check_header "X-Content-Type-Options" "nosniff"
check_header "X-XSS-Protection" "1; mode=block"
check_header "Referrer-Policy"
check_header "Strict-Transport-Security"

echo ""

# --------------------------------------------------
# Test 4: Page availability
# --------------------------------------------------
echo -e "${YELLOW}[4/5] Checking if page loads successfully...${NC}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Page loads successfully (HTTP 200)${NC}"
elif [[ "$HTTP_CODE" =~ ^30[12]$ ]]; then
    echo -e "${YELLOW}⚠ Redirect detected (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Page load failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# --------------------------------------------------
# Test 5: CSP recommendations (only if CSP exists)
# --------------------------------------------------
echo -e "${YELLOW}[5/5] Recommendations...${NC}"

if [ "$CSP_PRESENT" = false ]; then
    echo -e "${YELLOW}⚠ No CSP defined – security hardening recommended${NC}"
else
    if echo "$CSP_HEADER" | grep -qi "default-src 'none'"; then
        echo -e "${RED}✗ default-src 'none' may be too restrictive${NC}"
    fi

    if ! echo "$CSP_HEADER" | grep -qi "img-src.*data:"; then
        echo -e "${YELLOW}⚠ Consider adding data: to img-src${NC}"
    fi

    if ! echo "$CSP_HEADER" | grep -qi "font-src.*data:"; then
        echo -e "${YELLOW}⚠ Consider adding data: to font-src${NC}"
    fi

    if echo "$CSP_HEADER" | grep -qi "frame-ancestors 'none'"; then
        echo -e "${GREEN}✓ frame-ancestors protects against clickjacking${NC}"
    fi
fi
