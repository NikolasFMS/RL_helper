// Звуки игры
const clickSoundStart = new Audio('audio/ui-click-start.mp3'); // Звук начала
const clickSoundEnd = new Audio('audio/ui-click-end.mp3'); // Звук завершения

// Функция для генерации случайного числа с учётом времени
function ultraRandom(min, max) {
    const now = Date.now();
    const timeBasedRandom = (now % 1000) / 1000;
    const randomValue = (Math.random() + Math.random() * timeBasedRandom - Math.random() * timeBasedRandom);

    // Гарантируем, что результат находится в пределах min и max
    return Math.floor((Math.abs(randomValue) % 1) * (max - min + 1)) + min;
}

// Функция броска одной кости
function rollSingleDice(dice, duration) {
    var startTime = Date.now();
    var interval = 80; // Обновление каждые 100 миллисекунд
    playSound(clickSoundStart);

    // Обновляем изображение кости через интервалы времени
    var updateInterval = setInterval(function () {
        var currentTime = Date.now();
        var elapsedTime = (currentTime - startTime) / 1000; // Переводим в секунды

        // Генерируем случайное число от 1 до 6
        var randomNum = ultraRandom(1, 6);

        // Обновляем содержимое элемента кости соответствующим изображением
        dice.innerHTML = `<img src="pictures/${randomNum}.svg" alt="${randomNum}">`;

        // Проверяем, прошла ли заданная длительность
        if (elapsedTime >= duration) {
            clearInterval(updateInterval); // Прекращаем обновление изображения кости
            playSound(clickSoundEnd); // Проигрываем звук окончания
        }
    }, interval);
}

// Функция броска костей
function rollDice() {
    const hide = document.querySelector('.hidden');
    if (hide) {
        hide.classList.remove('hidden');
    }

    var dice1 = document.querySelector('.dice1');
    var dice2 = document.querySelector('.dice2');

    // Задаем случайную длительность между 1 и 4 секундами
    var duration1 = ultraRandom(1, 3);
    var duration2;

    do {
        duration2 = ultraRandom(1, 3);
    } while (duration2 == duration1);

    // Бросаем кости на случайную длительность
    rollSingleDice(dice1, duration1);
    rollSingleDice(dice2, duration2);
}

// Функция для определения, было ли взаимодействие пользователя
document.addEventListener('click', () => {
    userInteracted = true;
});

// Функция для воспроизведения звука
function playSound(sound) {
    // Перематываем аудио на начало (если требуется повторное воспроизведение)
    sound.currentTime = 0;
    // Воспроизводим звук
    sound.play();
}

// Скрипт для отображения прелоадера
window.onload = function () {
        if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker зарегистрирован с областью:', registration.scope);
            })
            .catch(error => {
                console.error('Ошибка при регистрации Service Worker:', error);
            });
    }
    setTimeout(function () {
        document.getElementById("preloader_malc").style.display = "none";
    }, 600);
};
