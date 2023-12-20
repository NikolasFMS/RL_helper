// Функция броска костей
function rollDice() {
    var dice1 = document.querySelector('.dice1');
    var dice2 = document.querySelector('.dice2');

    // Задаем случайную длительность между 1 и 4 секундами
    var duration1 = Math.floor(Math.random() * 2000) + 2000;
    var duration2;
    
    do {
      duration2 = Math.floor(Math.random() * 2000) + 2000;
    } while (duration2 == duration1);

    // Бросаем кости на случайную длительность
    rollSingleDice(dice1, duration1);
    rollSingleDice(dice2, duration2);
}

// Функция броска одной кости
function rollSingleDice(dice, duration) {
    var startTime = Date.now();
    var interval = 100; // Обновление каждые 100 миллисекунд
    playSound();

    // Обновляем изображение кости через интервалы времени
    var updateInterval = setInterval(function () {
        var currentTime = Date.now();
        var elapsedTime = currentTime - startTime;

        // Генерируем случайное число от 1 до 6
        var randomNum = Math.floor(Math.random() * 6) + 1;

        // Обновляем содержимое элемента кости соответствующим изображением
        dice.innerHTML = `<img src="pictures/${randomNum}.svg" alt="${randomNum}">`;

        // Проверяем, прошла ли заданная длительность
        if (elapsedTime >= duration) {
            clearInterval(updateInterval); // Прекращаем обновление изображения кости
            playEndSound(); // Проигрываем звук окончания
        }
    }, interval);
}

// Функция для проигрывания звука окончания
function playEndSound() {
    var audio = document.getElementById("clickSoundEnd");
    if (audio.readyState !== 4) {
        audio.load();
    }
    audio.play();
}

// Функция для проигрывания звука начала
function playSound() {
    var audio = document.getElementById("clickSoundStart");
    if (audio.readyState !== 4) {
        audio.load();
    }
    audio.play();
}
