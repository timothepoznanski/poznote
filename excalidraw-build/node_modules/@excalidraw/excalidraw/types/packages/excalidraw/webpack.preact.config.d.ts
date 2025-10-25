export = preactWebpackConfig;
declare const preactWebpackConfig: {
    entry: {
        [x: string]: string;
    };
    externals: {
        "react-dom/client": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        "react/jsx-runtime": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        react: {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        "react-dom": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
    } | {
        "react-dom/client": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        "react/jsx-runtime": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        react: {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        "react-dom": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
    };
    mode: string;
    devtool: boolean;
    output: {
        path: string;
        library: string;
        libraryTarget: string;
        filename: string;
        chunkFilename: string;
        assetModuleFilename: string;
        publicPath: string;
    };
    resolve: {
        extensions: string[];
    };
    module: {
        rules: ({
            test: RegExp;
            exclude: RegExp;
            use: (string | {
                loader: string;
                options?: undefined;
            } | {
                loader: string;
                options: {
                    postcssOptions: {
                        plugins: (import("postcss").Plugin & import("autoprefixer").ExportedAPI)[];
                    };
                };
            })[];
            resolve?: undefined;
            type?: undefined;
        } | {
            test: RegExp;
            resolve: {
                fullySpecified: boolean;
            };
            exclude?: undefined;
            use?: undefined;
            type?: undefined;
        } | {
            test: RegExp;
            exclude: RegExp;
            use: ({
                loader: string;
                options?: undefined;
            } | {
                loader: string;
                options: {
                    transpileOnly: boolean;
                    configFile: string;
                };
            })[];
            resolve?: undefined;
            type?: undefined;
        } | {
            test: RegExp;
            type: string;
            exclude?: undefined;
            use?: undefined;
            resolve?: undefined;
        })[];
    };
    optimization: {
        splitChunks: {
            chunks: string;
            cacheGroups: {
                vendors: {
                    test: RegExp;
                    name: string;
                };
            };
        };
        minimize?: undefined;
        minimizer?: undefined;
    };
    plugins: (import("webpack").EvalSourceMapDevToolPlugin | import("webpack").DefinePlugin)[];
} | {
    entry: {
        [x: string]: string;
    };
    externals: {
        "react-dom/client": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        "react/jsx-runtime": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        react: {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        "react-dom": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
    } | {
        "react-dom/client": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        "react/jsx-runtime": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        react: {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
        "react-dom": {
            root: string;
            commonjs2: string;
            commonjs: string;
            amd: string;
        };
    };
    mode: string;
    output: {
        path: string;
        library: string;
        libraryTarget: string;
        filename: string;
        chunkFilename: string;
        assetModuleFilename: string;
        publicPath: string;
    };
    resolve: {
        extensions: string[];
    };
    module: {
        rules: ({
            test: RegExp;
            exclude: RegExp;
            use: (string | {
                loader: string;
                options?: undefined;
            } | {
                loader: string;
                options: {
                    postcssOptions: {
                        plugins: (import("postcss").Plugin & import("autoprefixer").ExportedAPI)[];
                    };
                };
            })[];
            resolve?: undefined;
            type?: undefined;
        } | {
            test: RegExp;
            resolve: {
                fullySpecified: boolean;
            };
            exclude?: undefined;
            use?: undefined;
            type?: undefined;
        } | {
            test: RegExp;
            exclude: RegExp;
            use: ({
                loader: string;
                options?: undefined;
            } | {
                loader: string;
                options: {
                    transpileOnly: boolean;
                    configFile: string;
                    presets?: undefined;
                    plugins?: undefined;
                };
            } | {
                loader: string;
                options: {
                    presets: (string | (string | {
                        runtime: string;
                    })[])[];
                    plugins: string[];
                    transpileOnly?: undefined;
                    configFile?: undefined;
                };
            })[];
            resolve?: undefined;
            type?: undefined;
        } | {
            test: RegExp;
            type: string;
            exclude?: undefined;
            use?: undefined;
            resolve?: undefined;
        })[];
    };
    optimization: {
        minimize: boolean;
        minimizer: import("terser-webpack-plugin")<import("terser").MinifyOptions>[];
        splitChunks: {
            chunks: string;
            cacheGroups: {
                vendors: {
                    test: RegExp;
                    name: string;
                };
            };
        };
    };
    plugins: any[];
};
