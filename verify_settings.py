from playwright.sync_api import sync_playwright

def verify_settings_style():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Login
        print("Navigating to login page...")
        page.goto("http://localhost:8080/login.php")

        print("Logging in...")
        page.fill('input[name="username"]', "admin_change_me")
        page.fill('input[name="password"]', "admin")
        page.click('button[type="submit"]')

        # Wait for navigation
        page.wait_for_load_state('networkidle')

        # Check if we are on home page (index.php) or still on login
        print(f"Current URL: {page.url}")

        # Go to settings
        print("Navigating to settings.php...")
        page.goto("http://localhost:8080/settings.php")

        # Wait for settings to load
        page.wait_for_load_state('networkidle')

        # Take screenshot
        screenshot_path = "/home/jules/verification/settings_page.png"
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_settings_style()
