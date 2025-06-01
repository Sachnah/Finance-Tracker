// Income and expense categories
const incomeCategories = [
    'Salary',
    'Investment',
    'Rental Income',
    'Bonus',
    'Other Income'
];

const expenseCategories = [
    'Food',
    'Groceries',
    'Fuel',
    'Public Transit',
    'Entertainment',
    'Shopping',
    'Rent',
    'Travel',
    'Other Expense'
];

// Function to update category options based on transaction type
function updateCategoryOptions() {
    // Check which radio button is selected
    const typeIncome = document.getElementById('typeIncome');
    const categorySelect = document.getElementById('category');
    
    if (!categorySelect) return;
    
    // Clear existing options
    categorySelect.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a category';
    categorySelect.appendChild(defaultOption);
    
    // Get selected type based on radio buttons
    const selectedType = typeIncome && typeIncome.checked ? 'income' : 'expense';
    
    // Populate categories based on type
    const categories = selectedType === 'income' ? incomeCategories : expenseCategories;
    
    // Add options to select dropdown
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
}

// Initialize categories on page load
document.addEventListener('DOMContentLoaded', function() {
    updateCategoryOptions();
});
