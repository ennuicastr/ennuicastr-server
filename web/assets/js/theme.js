(function() {
    var themeB = document.getElementById("theme-b");

    var dark = document.cookie.split(";").some(function(x) { return /^\s*ECTHEME=dark\s*$/.test(x); });
    var theme;
    setTheme();
    setButton();

    function setTheme() {
        theme = dark?"dark":"";
        document.documentElement.setAttribute("data-theme", theme);
    }

    function setButton() {
        if (themeB)
            themeB.innerHTML = '<i class="bx bxs-' + (dark?"moon":"sun") + '"></i>';
    }

    if (themeB) {
        themeB.onclick = function(ev) {
            dark = !dark;
            setTheme();
            setButton();
            document.cookie = "ECTHEME=" + theme + ";path=/;max-age=15768000";

            ev.preventDefault();
            return false;
        };
    }
})();
