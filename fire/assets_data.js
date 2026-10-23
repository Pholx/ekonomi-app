const assetStructure = [
    // AKTIEFONDER
    { id: 'global', name: 'Globalindex', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 8.0, vol: 15.0 },
    { id: 'tech', name: 'Tech / Teknikfonder', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 10.5, vol: 22.0 },
    { id: 'sweden', name: 'Sverige (Storbolag)', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 9.0, vol: 18.0 },
    { id: 'sweden_small', name: 'Sverige Småbolag', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 10.0, vol: 22.0 },
    { id: 'norden', name: 'Norden', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 9.0, vol: 17.0 },
    { id: 'europa', name: 'Europa', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 7.5, vol: 16.0 },
    { id: 'asien', name: 'Asien', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 8.0, vol: 18.0 },    
    { id: 'tillväxtmarknad', name: 'Tillväxtmarknad', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 8.5, vol: 22.0 },
    { id: 'real_estate', name: 'Fastigheter', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 7.0, vol: 20.0 },
    { id: 'inv_bolag', name: 'Investmentbolag', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 9.5, vol: 20.0 },
    { id: 'mining', name: 'Gruvbolag', category: 'Aktiefonder', allocIsk: 0, allocDepa: 0, return: 7.0, vol: 28.0 },
    
    // RÄNTEFONDER & KONTON
    { id: 'cash_buffer', name: 'Likvider / Buffert', category: 'Räntefonder & Konton', allocIsk: 0, allocDepa: 0, return: 0.0, vol: 0.0 },
    { id: 'cash_account', name: 'Sparkonto (Med ränta)', category: 'Räntefonder & Konton', allocIsk: 0, allocDepa: 0, return: 3.0, vol: 0.5 },
    { id: 'bonds_short', name: 'Korta räntefonder', category: 'Räntefonder & Konton', allocIsk: 0, allocDepa: 0, return: 3.5, vol: 2.0 },
    { id: 'bonds_long', name: 'Långa räntefonder', category: 'Räntefonder & Konton', allocIsk: 0, allocDepa: 0, return: 4.0, vol: 6.0 },
    
    // RÅVAROR
    { id: 'gold', name: 'Guld', category: 'Råvaror', allocIsk: 0, allocDepa: 0, return: 5.0, vol: 15.0 },
    { id: 'silver', name: 'Silver', category: 'Råvaror', allocIsk: 0, allocDepa: 0, return: 5.0, vol: 22.0 },
    { id: 'other_metals', name: 'Övriga Metaller', category: 'Råvaror', allocIsk: 0, allocDepa: 0, return: 5.5, vol: 25.0 },    
    
    // KRYPTO
    { id: 'btc', name: 'Bitcoin (BTC)', category: 'Krypto', allocIsk: 0, allocDepa: 0, return: 22.0, vol: 55.0 },
    { id: 'eth', name: 'Ethereum (ETH)', category: 'Krypto', allocIsk: 0, allocDepa: 0, return: 24.0, vol: 65.0 },
    { id: 'sol', name: 'Solana (SOL)', category: 'Krypto', allocIsk: 0, allocDepa: 0, return: 28.0, vol: 85.0 },
    { id: 'alt', name: 'Alt-Krypto (High Vol)', category: 'Krypto', allocIsk: 0, allocDepa: 0, return: 30.0, vol: 100.0 },	
];