from playwright.sync_api import sync_playwright

def verify_icons():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Login
        print("Navigating to login page...")
        page.goto("http://localhost:8084/login.php")

        print("Logging in...")
        page.fill('input[name="username"]', "admin_change_me")
        page.fill('input[name="password"]', "admin")
        page.click('button[type="submit"]')

        # Wait for navigation
        page.wait_for_load_state('networkidle')

        # Check Home Page icons
        print("Checking Home Page...")
        page.goto("http://localhost:8084/home.php")
        page.wait_for_load_state('networkidle')

        # Take screenshot to verify icons are visible
        page.screenshot(path="/home/jules/verification/home_icons.png", full_page=True)
        print("Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    verify_icons()
