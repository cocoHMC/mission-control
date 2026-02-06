import { describe, expect, test } from 'vitest';

import { findVaultPlaceholdersInString, parseVaultPlaceholderRef } from '../vaultPlaceholders';

describe('vaultPlaceholders', () => {
  test('parseVaultPlaceholderRef: handle only', () => {
    expect(parseVaultPlaceholderRef('github_pat')).toEqual({ handle: 'github_pat' });
  });

  test('parseVaultPlaceholderRef: recognized field suffix', () => {
    expect(parseVaultPlaceholderRef('prod_admin.username')).toEqual({ handle: 'prod_admin', field: 'username' });
    expect(parseVaultPlaceholderRef('prod_admin.password')).toEqual({ handle: 'prod_admin', field: 'password' });
  });

  test('parseVaultPlaceholderRef: dot in handle does not imply field', () => {
    expect(parseVaultPlaceholderRef('aws_prod.access_key')).toEqual({ handle: 'aws_prod.access_key' });
  });

  test('findVaultPlaceholdersInString finds multiple matches', () => {
    const found = findVaultPlaceholdersInString('a={{vault:one}} b={{ vault:two.username }} c={{vault:aws_prod.access_key}}');
    expect(found.map((f) => f.ref)).toEqual([
      { handle: 'one' },
      { handle: 'two', field: 'username' },
      { handle: 'aws_prod.access_key' },
    ]);
  });
});

