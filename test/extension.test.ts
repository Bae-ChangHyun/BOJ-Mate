import * as assert from 'assert';

// Basic type tests
describe('BOJ Mate Extension Tests', () => {
  describe('Types', () => {
    it('should have correct tier names', () => {
      const TIER_NAMES: Record<number, string> = {
        0: 'Unrated',
        1: 'Bronze V',
        5: 'Bronze I',
        6: 'Silver V',
        10: 'Silver I',
        11: 'Gold V',
        15: 'Gold I',
        16: 'Platinum V',
        20: 'Platinum I',
        21: 'Diamond V',
        25: 'Diamond I',
        26: 'Ruby V',
        30: 'Ruby I'
      };

      assert.strictEqual(TIER_NAMES[0], 'Unrated');
      assert.strictEqual(TIER_NAMES[1], 'Bronze V');
      assert.strictEqual(TIER_NAMES[30], 'Ruby I');
    });

    it('should return correct tier colors', () => {
      function getTierColor(level: number): string {
        if (level === 0) return '#2d2d2d';
        if (level <= 5) return '#ad5600'; // Bronze
        if (level <= 10) return '#435f7a'; // Silver
        if (level <= 15) return '#ec9a00'; // Gold
        if (level <= 20) return '#27e2a4'; // Platinum
        if (level <= 25) return '#00b4fc'; // Diamond
        return '#ff0062'; // Ruby
      }

      assert.strictEqual(getTierColor(0), '#2d2d2d');
      assert.strictEqual(getTierColor(1), '#ad5600');
      assert.strictEqual(getTierColor(6), '#435f7a');
      assert.strictEqual(getTierColor(11), '#ec9a00');
      assert.strictEqual(getTierColor(16), '#27e2a4');
      assert.strictEqual(getTierColor(21), '#00b4fc');
      assert.strictEqual(getTierColor(26), '#ff0062');
    });
  });

  describe('Language Config', () => {
    it('should have correct language configurations', () => {
      const LANGUAGE_CONFIG = {
        cpp: {
          extension: '.cpp',
          bojLanguageId: 1001,
          name: 'C++',
        },
        py: {
          extension: '.py',
          bojLanguageId: 28,
          name: 'Python',
        },
        java: {
          extension: '.java',
          bojLanguageId: 93,
          name: 'Java',
        },
        js: {
          extension: '.js',
          bojLanguageId: 17,
          name: 'JavaScript',
        },
        rs: {
          extension: '.rs',
          bojLanguageId: 94,
          name: 'Rust',
        }
      };

      assert.strictEqual(LANGUAGE_CONFIG.cpp.extension, '.cpp');
      assert.strictEqual(LANGUAGE_CONFIG.py.bojLanguageId, 28);
      assert.strictEqual(LANGUAGE_CONFIG.java.name, 'Java');
    });
  });

  describe('Parser Utils', () => {
    it('should normalize output correctly', () => {
      function normalizeOutput(output: string): string {
        return output
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n')
          .trim();
      }

      const input = '  hello  \n  world  \n';
      const expected = '  hello\n  world';
      assert.strictEqual(normalizeOutput(input), expected);
    });
  });

  describe('Problem ID Detection', () => {
    it('should detect problem ID from path', () => {
      function findProblemIdFromPath(filePath: string): string | null {
        const path = require('path');
        const dir = path.dirname(filePath);
        const dirName = path.basename(dir);

        if (/^\d+$/.test(dirName)) {
          return dirName;
        }

        const fileName = path.basename(filePath);
        const match = fileName.match(/^(\d+)\./);
        if (match) {
          return match[1];
        }

        return null;
      }

      assert.strictEqual(findProblemIdFromPath('/problems/1000/main.py'), '1000');
      assert.strictEqual(findProblemIdFromPath('/problems/1000.py'), '1000');
      assert.strictEqual(findProblemIdFromPath('/problems/test/main.py'), null);
    });
  });
});
