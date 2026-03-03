import { test, expect, Page } from '@playwright/test';

test.describe('Chat Synchronization', () => {
  let userPage: Page;
  let adminPage: Page;

  test.beforeAll(async ({ browser }) => {
    // Create pages for two different users
    userPage = await browser.newPage();
    adminPage = await browser.newPage();
  });

  test.afterAll(async () => {
    await userPage.close();
    await adminPage.close();
  });

  test('messages should sync between two users', async () => {
    // Login as first user and navigate to chat
    await userPage.goto('/login');
    await userPage.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'user@example.com');
    await userPage.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'password');
    await userPage.click('button[type="submit"]');
    await userPage.waitForURL('/*');
    await userPage.goto('/admin/chat');
    await userPage.waitForSelector('div[class*="messageBubble"]');

    // Login as admin and navigate to chat
    await adminPage.goto('/login');
    await adminPage.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@example.com');
    await adminPage.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'password');
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL('/*');
    await adminPage.goto('/admin/chat');
    await adminPage.waitForSelector('div[class*="messageBubble"]');

    // Send a test message from first user
    const testMessage = `test-sync-${Date.now()}`;
    await userPage.fill('input[placeholder="Type your message..."]', testMessage);
    await userPage.click('button[aria-label="Send message"]');
    
    // Verify message appears in first user's chat
    await userPage.waitForSelector(`text=${testMessage}`);
    
    // Wait for message to appear in second user's chat via realtime subscription
    // This may take a moment for the subscription to receive the message
    await adminPage.waitForSelector(`text=${testMessage}`, { timeout: 10000 });
    
    // Verify the message content matches
    const messageInAdmin = await adminPage.textContent(`text=${testMessage}`);
    expect(messageInAdmin).toContain(testMessage);
  });
}); 