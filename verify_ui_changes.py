from playwright.sync_api import sync_playwright

def verify_buttons_and_navigation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Login
        print("Navigating to login page...")
        page.goto("http://localhost:8083/login.php")

        print("Logging in...")
        page.fill('input[name="username"]', "admin_change_me")
        page.fill('input[name="password"]', "admin")
        page.click('button[type="submit"]')

        # Wait for navigation
        page.wait_for_load_state('networkidle')

        # Check Home Page "Back to Notes"
        print("Checking Home Page...")
        page.goto("http://localhost:8083/home.php")
        page.wait_for_load_state('networkidle')

        # First card should be Back to Notes
        first_card_title = page.locator('.home-card .home-card-title').first.text_content()
        print(f"First card on Home: {first_card_title}")
        if "Back to Notes" in first_card_title or "Retour" in first_card_title:
             print("SUCCESS: Back to Notes is first on Home.")
        else:
             print(f"FAILURE: First card is {first_card_title}")
        page.screenshot(path="/home/jules/verification/home_page.png", full_page=True)

        # Check Create Page
        print("Checking Create Page...")
        page.goto("http://localhost:8083/create.php")
        page.wait_for_load_state('networkidle')

        first_card_title_create = page.locator('.home-card .home-card-title').first.text_content()
        print(f"First card on Create: {first_card_title_create}")
        if "Back to Notes" in first_card_title_create or "Retour" in first_card_title_create:
             print("SUCCESS: Back to Notes is first on Create.")
        else:
             print(f"FAILURE: First card is {first_card_title_create}")

        # Check Cancel button removed
        cancel_card = page.locator('.home-card-red')
        if cancel_card.count() == 0:
            print("SUCCESS: Cancel card removed from Create.")
        else:
            print("FAILURE: Cancel card still present.")

        page.screenshot(path="/home/jules/verification/create_page.png", full_page=True)

        # Check GitHub Sync Page
        print("Checking GitHub Sync Page...")
        page.goto("http://localhost:8083/github_sync.php")
        page.wait_for_load_state('networkidle')
        page.screenshot(path="/home/jules/verification/github_sync_centered.png", full_page=True)

        # Check Workspaces Page
        print("Checking Workspaces Page...")
        page.goto("http://localhost:8083/workspaces.php")
        page.wait_for_load_state('networkidle')
        page.screenshot(path="/home/jules/verification/workspaces_centered.png", full_page=True)

        # Check Users Page
        print("Checking Users Page...")
        page.goto("http://localhost:8083/admin/users.php")
        page.wait_for_load_state('networkidle')
        page.screenshot(path="/home/jules/verification/users_centered.png", full_page=True)

        # Check Backup Page
        print("Checking Backup Page...")
        page.goto("http://localhost:8083/backup_export.php")
        page.wait_for_load_state('networkidle')
        page.screenshot(path="/home/jules/verification/backup_centered.png", full_page=True)

        # Check Restore Page
        print("Checking Restore Page...")
        page.goto("http://localhost:8083/restore_import.php")
        page.wait_for_load_state('networkidle')
        page.screenshot(path="/home/jules/verification/restore_centered.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    verify_buttons_and_navigation()
