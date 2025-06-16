const categoryKeywords = {
    'Food': ['restaurant', 'cafe', 'groceries', 'food', 'starbucks', 'mcdonalds'],
    'Transportation': ['gas', 'uber', 'lyft', 'taxi', 'transport'],
    'Entertainment': ['movie', 'concert', 'netflix', 'spotify', 'hulu'],
    'Shopping': ['amazon', 'walmart', 'target', 'shopping'],
    'Utilities': ['electricity', 'water', 'internet', 'phone'],
    'Health': ['pharmacy', 'doctor', 'hospital', 'health'],
    'Other': []
};

function categorizeTransaction(description) {
    if (!description) {
        return 'Other';
    }

    const lowerCaseDescription = description.toLowerCase();

    for (const category in categoryKeywords) {
        for (const keyword of categoryKeywords[category]) {
            if (lowerCaseDescription.includes(keyword)) {
                return category;
            }
        }
    }

    return 'Other';
}

module.exports = {
    categorizeTransaction
};
