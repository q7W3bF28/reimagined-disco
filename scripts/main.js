document.addEventListener('DOMContentLoaded', function() {
    const shareChoice = document.getElementById('share-choice');
    const viewChoice = document.getElementById('view-choice');
    
    if (shareChoice) {
        shareChoice.addEventListener('click', function() {
            window.location.href = 'share.html';
        });
    }
    
    if (viewChoice) {
        viewChoice.addEventListener('click', function() {
            window.location.href = 'view.html';
        });
    }
});