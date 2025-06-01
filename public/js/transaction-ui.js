// Transaction UI enhancements

// Handle transaction type toggle styling
document.addEventListener('DOMContentLoaded', function() {
    // Set up transaction type toggle
    const typeIncome = document.getElementById('typeIncome');
    const typeExpense = document.getElementById('typeExpense');
    const incomeLabel = document.querySelector('label[for="typeIncome"]');
    const expenseLabel = document.querySelector('label[for="typeExpense"]');

    function updateTypeToggle() {
        // Reset both labels
        incomeLabel.style.backgroundColor = 'transparent';
        expenseLabel.style.backgroundColor = 'transparent';
        
        // Highlight active label
        if (typeIncome.checked) {
            incomeLabel.style.backgroundColor = '#ffffff';
            incomeLabel.style.boxShadow = '0 2px 5px rgba(0,0,0,0.08)';
        } else {
            expenseLabel.style.backgroundColor = '#ffffff';
            expenseLabel.style.boxShadow = '0 2px 5px rgba(0,0,0,0.08)';
        }
    }

    // Initial setup
    updateTypeToggle();

    // Add event listeners for visual toggle only
    typeIncome.addEventListener('change', updateTypeToggle);
    typeExpense.addEventListener('change', updateTypeToggle);

    // Transaction search functionality
    const searchInput = document.getElementById('transactionSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const rows = document.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
});

// Function to suggest category based on description
function suggestCategory(descriptionId, categoryId, suggestionId) {
    const description = document.getElementById(descriptionId).value.toLowerCase();
    const categorySelect = document.getElementById(categoryId);
    const suggestionElement = document.getElementById(suggestionId);
    
    // Skip if description is too short
    if (description.length < 3) {
        suggestionElement.textContent = '';
        return;
    }
    
    // Simple keyword matching
    const keywords = {
        // Income keywords
        'salary': 'Salary',
        'pay': 'Salary',
        'wage': 'Salary',
        'invest': 'Investment',
        'dividend': 'Investment',
        'stock': 'Investment',
        'rent': 'Rental Income',
        'tenant': 'Rental Income',
        'bonus': 'Bonus',
        'commission': 'Bonus',
        
        // Expense keywords
        'restaurant': 'Food',
        'lunch': 'Food',
        'dinner': 'Food',
        'breakfast': 'Food',
        'cafe': 'Food',
        'grocery': 'Groceries',
        'supermarket': 'Groceries',
        'market': 'Groceries',
        'petrol': 'Fuel',
        'gas': 'Fuel',
        'diesel': 'Fuel',
        'bus': 'Public Transit',
        'train': 'Public Transit',
        'subway': 'Public Transit',
        'metro': 'Public Transit',
        'taxi': 'Public Transit',
        'uber': 'Public Transit',
        'ola': 'Public Transit',
        'movie': 'Entertainment',
        'game': 'Entertainment',
        'concert': 'Entertainment',
        'clothes': 'Shopping',
        'shoes': 'Shopping',
        'electronics': 'Shopping',
        'gadget': 'Shopping',
        'apartment': 'Rent',
        'house': 'Rent',
        'trip': 'Travel',
        'vacation': 'Travel',
        'flight': 'Travel',
        'hotel': 'Travel',
        'travel': 'Travel',
        'interest': 'Investment'
    };
    
    // Check for keyword matches
    for (const keyword in keywords) {
        if (description.includes(keyword)) {
            const suggestedCategory = keywords[keyword];
            
            // Find and select the matching option
            for (let i = 0; i < categorySelect.options.length; i++) {
                if (categorySelect.options[i].text === suggestedCategory) {
                    categorySelect.selectedIndex = i;
                    suggestionElement.textContent = `Suggested category: ${suggestedCategory}`;
                    return;
                }
            }
        }
    }
    
    // No suggestion found
    suggestionElement.textContent = '';
}

// We're not overriding the updateCategoryOptions function anymore
// The original function from transaction-categories.js will be used instead
