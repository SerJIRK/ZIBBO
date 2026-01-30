/**
 * Модуль управления рекламой для ZIBBO
 */
const AdMgr = {
    controller: null,
    blockId: "9a1dea9f8d134730875d57f334be6f6e", // Твой актуальный ID

    init() {
        if (window.Adsgram) {
            this.controller = window.Adsgram.init({
                blockId: this.blockId,
                debug: false // Поставь true для тестов (будет имитация)
            });
            console.log("Adsgram initialized");
        } else {
            console.warn("Adsgram SDK not found");
        }
    },

    /**
     * Вызов видео-рекламы за вознаграждение (Revive)
     * @returns {Promise} - резолвится, если реклама просмотрена
     */
    async showRewardAd() {
        if (!this.controller) {
            console.log("No Ad Controller, auto-success for dev");
            return Promise.resolve(); 
        }

        try {
            const result = await this.controller.show();
            // result будет содержать инфо о просмотре
            return Promise.resolve(result);
        } catch (error) {
            // Ошибка: реклама не загружена, пользователь закрыл раньше и т.д.
            console.error("Ad error or skip:", error);
            return Promise.reject(error);
        }
    }
};

// Инициализируем сразу при загрузке скрипта
window.addEventListener('load', () => AdMgr.init());
