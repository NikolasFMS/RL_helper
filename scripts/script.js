function rollDice() {
    var dice1 = document.querySelector('.dice1');
    var dice2 = document.querySelector('.dice2');

    // Set a random duration between 2 and 4 seconds
    var duration = Math.floor(Math.random() * 2000) + 2000;

    // Roll the dice for the random duration
    rollSingleDice(dice1, duration);
    rollSingleDice(dice2, duration);
}

function rollSingleDice(dice, duration) {
    var startTime = Date.now();
    var interval = 100; // Update every 100 milliseconds
    playSound();

    // Update the dice image at intervals
    var updateInterval = setInterval(function () {
        var currentTime = Date.now();
        var elapsedTime = currentTime - startTime;

        // Generate a random number between 1 and 6
        var randomNum = Math.floor(Math.random() * 6) + 1;

        // Update the content of the dice element with the corresponding image
        dice.innerHTML = `<img src="pictures/${randomNum}.svg" alt="${randomNum}">`;

        // Check if the duration has passed
        if (elapsedTime >= duration) {
            clearInterval(updateInterval); // Stop updating the dice image
            playEndSound(); // Play the end sound
        }
    }, interval);
}
        // Function to play the end sound
        function playEndSound() {
            var audio = document.getElementById("clickSoundEnd");
            if (audio.readyState !== 4) {
                audio.load();
            }
            audio.play();
        }

// Function to play the click sound
function playSound() {
    var audio = document.getElementById("clickSoundStart");
    if (audio.readyState !== 4) {
        audio.load();
    }
    audio.play();
}

