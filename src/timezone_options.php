<?php
/**
 * The <option> list of the timezone selector.
 *
 * Two places render the same list: the timezone modal of the app
 * (src/modals.php) and the first-run startup guide (src/public/welcome.php).
 * The guide used to copy the modal's innerHTML at runtime, which only worked
 * while both lived on index.php; the guide is a page of its own now, so the
 * list is a partial instead of a duplicate.
 *
 * The group labels carry data-i18n-label so a page that switches language
 * without reloading (the guide does) can retranslate them.
 */
?>
                <option value="UTC">UTC</option>
                <optgroup data-i18n-label="modals.timezone.groups.europe" label="<?php echo t_h('modals.timezone.groups.europe', [], 'Europe'); ?>">
                    <option value="Europe/Paris">Europe/Paris (France, CET/CEST)</option>
                    <option value="Europe/London">Europe/London (UK, GMT/BST)</option>
                    <option value="Europe/Brussels">Europe/Brussels (Belgium, CET/CEST)</option>
                    <option value="Europe/Amsterdam">Europe/Amsterdam (Netherlands, CET/CEST)</option>
                    <option value="Europe/Berlin">Europe/Berlin (Germany, CET/CEST)</option>
                    <option value="Europe/Madrid">Europe/Madrid (Spain, CET/CEST)</option>
                    <option value="Europe/Rome">Europe/Rome (Italy, CET/CEST)</option>
                    <option value="Europe/Zurich">Europe/Zurich (Switzerland, CET/CEST)</option>
                    <option value="Europe/Vienna">Europe/Vienna (Austria, CET/CEST)</option>
                    <option value="Europe/Warsaw">Europe/Warsaw (Poland, CET/CEST)</option>
                    <option value="Europe/Stockholm">Europe/Stockholm (Sweden, CET/CEST)</option>
                    <option value="Europe/Copenhagen">Europe/Copenhagen (Denmark, CET/CEST)</option>
                    <option value="Europe/Oslo">Europe/Oslo (Norway, CET/CEST)</option>
                    <option value="Europe/Helsinki">Europe/Helsinki (Finland, EET/EEST)</option>
                    <option value="Europe/Athens">Europe/Athens (Greece, EET/EEST)</option>
                    <option value="Europe/Moscow">Europe/Moscow (Russia, MSK)</option>
                    <option value="Europe/Lisbon">Europe/Lisbon (Portugal, WET/WEST)</option>
                    <option value="Europe/Dublin">Europe/Dublin (Ireland, GMT/IST)</option>
                    <option value="Atlantic/Reykjavik">Atlantic/Reykjavik (Iceland, GMT)</option>
                    <option value="Europe/Prague">Europe/Prague (Czech Republic, CET/CEST)</option>
                    <option value="Europe/Budapest">Europe/Budapest (Hungary, CET/CEST)</option>
                    <option value="Europe/Belgrade">Europe/Belgrade (Serbia, CET/CEST)</option>
                    <option value="Europe/Bucharest">Europe/Bucharest (Romania, EET/EEST)</option>
                    <option value="Europe/Sofia">Europe/Sofia (Bulgaria, EET/EEST)</option>
                    <option value="Europe/Kyiv">Europe/Kyiv (Ukraine, EET/EEST)</option>
                    <option value="Europe/Istanbul">Europe/Istanbul (Turkey, TRT)</option>
                </optgroup>
                <optgroup data-i18n-label="modals.timezone.groups.america" label="<?php echo t_h('modals.timezone.groups.america', [], 'America'); ?>">
                    <option value="America/New_York">America/New_York (US Eastern)</option>
                    <option value="America/Chicago">America/Chicago (US Central)</option>
                    <option value="America/Denver">America/Denver (US Mountain)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (US Pacific)</option>
                    <option value="America/Phoenix">America/Phoenix (US Arizona)</option>
                    <option value="America/Anchorage">America/Anchorage (US Alaska)</option>
                    <option value="Pacific/Honolulu">Pacific/Honolulu (US Hawaii)</option>
                    <option value="America/St_Johns">America/St_Johns (Newfoundland, NST/NDT)</option>
                    <option value="America/Halifax">America/Halifax (Canada Atlantic, AST/ADT)</option>
                    <option value="America/Toronto">America/Toronto (Canada Eastern)</option>
                    <option value="America/Winnipeg">America/Winnipeg (Canada Central, CST/CDT)</option>
                    <option value="America/Regina">America/Regina (Canada Saskatchewan, CST)</option>
                    <option value="America/Edmonton">America/Edmonton (Canada Mountain, MST/MDT)</option>
                    <option value="America/Vancouver">America/Vancouver (Canada Pacific)</option>
                    <option value="America/Whitehorse">America/Whitehorse (Canada Yukon, MST)</option>
                    <option value="America/Mexico_City">America/Mexico_City (Mexico)</option>
                    <option value="America/Havana">America/Havana (Cuba)</option>
                    <option value="America/Puerto_Rico">America/Puerto_Rico (Puerto Rico, AST)</option>
                    <option value="America/Jamaica">America/Jamaica (Jamaica, EST)</option>
                    <option value="America/Guatemala">America/Guatemala (Guatemala)</option>
                    <option value="America/Panama">America/Panama (Panama)</option>
                    <option value="America/Caracas">America/Caracas (Venezuela)</option>
                    <option value="America/Sao_Paulo">America/Sao_Paulo (Brazil)</option>
                    <option value="America/Buenos_Aires">America/Buenos_Aires (Argentina)</option>
                    <option value="America/Montevideo">America/Montevideo (Uruguay)</option>
                    <option value="America/Santiago">America/Santiago (Chile)</option>
                    <option value="America/Bogota">America/Bogota (Colombia)</option>
                    <option value="America/Lima">America/Lima (Peru)</option>
                </optgroup>
                <optgroup data-i18n-label="modals.timezone.groups.asia" label="<?php echo t_h('modals.timezone.groups.asia', [], 'Asia'); ?>">
                    <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (India)</option>
                    <option value="Asia/Bangkok">Asia/Bangkok (Thailand)</option>
                    <option value="Asia/Singapore">Asia/Singapore</option>
                    <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
                    <option value="Asia/Shanghai">Asia/Shanghai (China)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (Japan)</option>
                    <option value="Asia/Seoul">Asia/Seoul (South Korea)</option>
                    <option value="Asia/Jakarta">Asia/Jakarta (Indonesia)</option>
                    <option value="Asia/Manila">Asia/Manila (Philippines)</option>
                    <option value="Asia/Taipei">Asia/Taipei (Taiwan)</option>
                    <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (Vietnam)</option>
                    <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (Malaysia)</option>
                    <option value="Asia/Colombo">Asia/Colombo (Sri Lanka)</option>
                    <option value="Asia/Dhaka">Asia/Dhaka (Bangladesh)</option>
                    <option value="Asia/Yangon">Asia/Yangon (Myanmar)</option>
                    <option value="Asia/Kathmandu">Asia/Kathmandu (Nepal)</option>
                    <option value="Asia/Karachi">Asia/Karachi (Pakistan)</option>
                    <option value="Asia/Tehran">Asia/Tehran (Iran)</option>
                    <option value="Asia/Jerusalem">Asia/Jerusalem (Israel)</option>
                    <option value="Asia/Riyadh">Asia/Riyadh (Saudi Arabia)</option>
                    <option value="Asia/Tbilisi">Asia/Tbilisi (Georgia)</option>
                    <option value="Asia/Yerevan">Asia/Yerevan (Armenia)</option>
                    <option value="Asia/Baku">Asia/Baku (Azerbaijan)</option>
                    <option value="Asia/Almaty">Asia/Almaty (Kazakhstan)</option>
                    <option value="Asia/Tashkent">Asia/Tashkent (Uzbekistan)</option>
                </optgroup>
                <optgroup data-i18n-label="modals.timezone.groups.pacific" label="<?php echo t_h('modals.timezone.groups.pacific', [], 'Pacific'); ?>">
                    <option value="Pacific/Auckland">Pacific/Auckland (New Zealand)</option>
                    <option value="Australia/Sydney">Australia/Sydney</option>
                    <option value="Australia/Melbourne">Australia/Melbourne</option>
                    <option value="Australia/Hobart">Australia/Hobart (Tasmania)</option>
                    <option value="Australia/Adelaide">Australia/Adelaide (Australia Central)</option>
                    <option value="Australia/Brisbane">Australia/Brisbane</option>
                    <option value="Australia/Darwin">Australia/Darwin (Northern Territory)</option>
                    <option value="Australia/Perth">Australia/Perth</option>
                    <option value="Pacific/Chatham">Pacific/Chatham (Chatham Islands)</option>
                    <option value="Pacific/Guam">Pacific/Guam</option>
                    <option value="Pacific/Port_Moresby">Pacific/Port_Moresby (Papua New Guinea)</option>
                    <option value="Pacific/Apia">Pacific/Apia (Samoa)</option>
                    <option value="Pacific/Tongatapu">Pacific/Tongatapu (Tonga)</option>
                    <option value="Pacific/Fiji">Pacific/Fiji</option>
                </optgroup>
                <optgroup data-i18n-label="modals.timezone.groups.africa" label="<?php echo t_h('modals.timezone.groups.africa', [], 'Africa'); ?>">
                    <option value="Africa/Cairo">Africa/Cairo (Egypt)</option>
                    <option value="Africa/Johannesburg">Africa/Johannesburg (South Africa)</option>
                    <option value="Africa/Lagos">Africa/Lagos (Nigeria)</option>
                    <option value="Africa/Nairobi">Africa/Nairobi (Kenya)</option>
                    <option value="Africa/Casablanca">Africa/Casablanca (Morocco)</option>
                    <option value="Africa/Algiers">Africa/Algiers (Algeria)</option>
                    <option value="Africa/Tunis">Africa/Tunis (Tunisia)</option>
                    <option value="Africa/Accra">Africa/Accra (Ghana)</option>
                    <option value="Africa/Abidjan">Africa/Abidjan (Cote d'Ivoire)</option>
                    <option value="Africa/Maputo">Africa/Maputo (Mozambique)</option>
                    <option value="Africa/Harare">Africa/Harare (Zimbabwe)</option>
                </optgroup>
