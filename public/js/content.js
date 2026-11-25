export async function loadFixture() {
  const response = await fetch('/dev/fixture.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`fixture HTTP ${response.status}`);
  const story = await response.json();
  if (!story.isTestFixture) throw new Error('Ожидался тестовый fixture');
  return story;
}
